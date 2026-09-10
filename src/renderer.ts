import {
  Color,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  RingGeometry,
  Vector2,
  Vector3,
  type CanvasTexture,
} from 'three';
import { CAMERA, TIERS, ZOOM_STEP } from './constants';
import {
  applyDrag,
  applyPan,
  applyWheel,
  clampZoom,
  createOrbit,
  resetOrbit,
  scaleLabel,
  sizeCamera,
  tierOf,
  tickOrbit,
  zoomToPoint,
  type Orbit,
} from './camera';
import {
  applyPalette,
  buildGround,
  createScene,
  disposeScene,
  resizeScene,
  type GapMarker,
  type SceneParts,
} from './scene';
import {
  buildBuildings,
  createWindowTextures,
  setWindowLevel,
  windowLevelFor,
  type BuildingView,
  type RouteView,
} from './buildings';
import { buildOutskirts, type Lane } from './outskirts';
import { createTraffic, type Traffic } from './traffic';
import { createAmbient, type Ambient } from './ambient';
import {
  animateConstruction,
  buildConstruction,
  type ConstructionSite,
} from './construction';
import { createPalette, type Palette, type PaletteInput } from './palette';
import {
  layoutCity,
  type Building,
  type CityLayout,
  type District,
} from './layout';
import { EMPTY_CITY, type CityData } from './types';
import { project, toggleClass, type Projected } from './labels';
import { Emitter } from './emitter';

const SVGNS = 'http://www.w3.org/2000/svg';
const TRAFFIC_CARS = 36;
/** 가까운 시야에서 한 번에 띄우는 건물 라벨 수 */
const LABEL_MAX = 8;

export interface CityRendererEvents extends Record<string, unknown> {
  /** 마우스가 올라간 건물 (없으면 null) */
  hover: Building | null;
  /** 클릭으로 고른 건물 (빈 곳을 누르면 null) */
  select: Building | null;
  /** 시야가 바뀔 때 — 배율 단계와 축척 문구 */
  view: { tier: number; tierName: string; scale: string; zoom: number };
}

export interface CityRendererOptions {
  /** 색 덮어쓰기 */
  palette?: PaletteInput;
  /** 밤 모드로 시작 */
  night?: boolean;
  /** 도시 바깥 배경(외곽 블록·강) */
  outskirts?: boolean;
  /** 도로 위 차량 */
  traffic?: boolean;
  /** 공중에 떠다니는 입자 */
  ambient?: boolean;
  /** 공사 장비 — 항목이 늘어난 건물 옆에 세운다 */
  construction?: boolean;
  /** 조작이 없을 때 천천히 회전 */
  autoRotate?: boolean;
  /** 건물이 올라오는 시간(초). 0 이면 바로 세운다. 기본 2.6 */
  riseSeconds?: number;
  /** 건물 라벨 표시 */
  labels?: boolean;
  /** 라벨의 항목 수 표기. 기본은 숫자만 */
  formatCount?: (n: number) => string;
  /** 좌·우에서 UI가 가리는 폭(px) — 도시를 남은 공간 가운데로 민다 */
  insets?: { left: number; right: number };
}

export interface CityRenderer {
  /** 데이터를 새로 넣는다. 도시를 다시 세운다 */
  setData(data: CityData): void;
  /** 현재 배치 (좌표·크기까지 계산된 결과) */
  getLayout(): CityLayout | null;
  /** 건물 하나로 — 보고 있는 각도를 유지한 채 확대한다 */
  focusBuilding(id: string, zoom?: number): void;
  /** 구역 하나가 보이는 높이로 */
  focusDistrict(id: string): void;
  /** 처음 시점으로 */
  home(): void;
  zoomBy(factor: number): void;
  setZoom(zoom: number): void;
  setNight(on: boolean): void;
  setAutoRotate(on: boolean): void;
  /** 강조할 건물 — 나머지는 옅어진다. null 이면 강조 해제 */
  setHighlight(ids: string[] | null): void;
  /** 이 값보다 활성도가 낮은 건물은 창 불이 꺼진다 (0~1) */
  setActivityThreshold(t: number): void;
  /** 팔레트를 다시 계산한다(테마 전환) */
  setPalette(input: PaletteInput): void;
  resize(): void;
  start(): void;
  stop(): void;
  dispose(): void;
  on<K extends keyof CityRendererEvents>(
    event: K,
    fn: (payload: CityRendererEvents[K]) => void,
  ): () => void;
  /** three.js 렌더러가 만든 캔버스 */
  readonly canvas: HTMLCanvasElement;
}

interface DistrictLabel {
  el: HTMLDivElement;
  district: District;
  pos: Vector3;
}

/**
 * 데이터를 아이소메트릭 도시로 그리는 렌더러.
 *
 * 컨테이너 안에 캔버스와 라벨 오버레이를 만들고, 리사이즈·조작·라벨 배치까지 맡는다.
 * 데이터를 바꾸면 도시를 다시 세운다.
 */
export function createCityRenderer(
  container: HTMLElement,
  options: CityRendererOptions = {},
): CityRenderer {
  const opt = {
    outskirts: true,
    traffic: true,
    ambient: true,
    construction: true,
    autoRotate: true,
    labels: true,
    night: false,
    ...options,
  };
  const events = new Emitter<CityRendererEvents>();
  let palette: Palette = createPalette(opt.palette);
  let night = !!opt.night;
  let autoRotate = !!opt.autoRotate;
  let insets = opt.insets ?? { left: 0, right: 0 };

  if (getComputedStyle(container).position === 'static')
    container.style.position = 'relative';
  const parts: SceneParts = createScene(container);

  const overlay = document.createElement('div');
  overlay.className = 'vs-overlay';
  const leaders = document.createElementNS(SVGNS, 'svg');
  leaders.setAttribute('class', 'vs-leaders');
  container.append(leaders, overlay);

  const windowTexes: CanvasTexture[] = createWindowTextures();
  const orbit: Orbit = createOrbit();
  const ray = new Raycaster();
  const mouse = new Vector2();
  const tmp = new Vector3();
  const scr: Projected = { x: 0, y: 0, z: 0 };

  let layout: CityLayout | null = null;
  let views: BuildingView[] = [];
  let indexOf = new Map<string, number>();
  let routes: RouteView[] = [];
  let pickTargets: Mesh[] = [];
  let gapMarkers: GapMarker[] = [];
  let districtLabels: DistrictLabel[] = [];
  let gapLabels: { el: HTMLDivElement; pos: Vector3 }[] = [];
  let lanes: Lane[] = [];
  let traffic: Traffic | null = null;
  let ambient: Ambient | null = null;
  let site: ConstructionSite | null = null;
  let selRing: Mesh<RingGeometry, MeshBasicMaterial> | null = null;

  let hovered: Building | null = null;
  let selected: Building | null = null;
  let highlight: Set<string> | null = null;
  let threshold = 0;
  let raf = 0;
  let running = false;
  let startedAt = 0;
  let lastFrame = 0;
  let lastInteract = 0;
  let riseT = -1;
  let lastTier = -1;
  let lastScale = '';
  let rect: { w: number; h: number; left: number; top: number } | null = null;

  const size = (): { w: number; h: number; left: number; top: number } => {
    if (!rect) {
      const r = container.getBoundingClientRect();
      rect = {
        w: Math.max(1, r.width),
        h: Math.max(1, r.height),
        left: r.left,
        top: r.top,
      };
    }
    return rect;
  };
  const invalidate = (): void => {
    rect = null;
  };

  function clearCity(): void {
    for (const v of views) {
      v.label.remove();
      v.leader.remove();
    }
    for (const l of districtLabels) l.el.remove();
    for (const l of gapLabels) l.el.remove();
    districtLabels = [];
    gapLabels = [];
    parts.cityGroup.clear();
    parts.routeGroup.clear();
    parts.constrGroup.clear();
    views = [];
    routes = [];
    pickTargets = [];
    gapMarkers = [];
    site = null;
    traffic = null;
    ambient = null;
    hovered = null;
    selected = null;
    if (selRing) {
      parts.scene.remove(selRing);
      selRing.geometry.dispose();
      selRing.material.dispose();
      selRing = null;
    }
  }

  function makeDistrictLabels(city: CityLayout): void {
    for (const d of city.districts) {
      const el = document.createElement('div');
      el.className = 'vs-district';
      const b = document.createElement('b');
      b.textContent = d.label;
      el.append(b);
      el.style.setProperty(
        '--accent',
        `#${d.hue.toString(16).padStart(6, '0')}`,
      );
      overlay.appendChild(el);
      districtLabels.push({
        el,
        district: d,
        pos: new Vector3(d.at[0], 0, d.at[1]),
      });
    }
  }

  /** 빈 필지 이름 — 아직 채워지지 않은 자리를 가리킨다 */
  function makeGapLabels(): void {
    for (const g of gapMarkers) {
      const el = document.createElement('div');
      el.className = 'vs-gap';
      el.textContent = g.name;
      overlay.appendChild(el);
      gapLabels.push({ el, pos: g.pos.clone() });
    }
  }

  function setData(data: CityData): void {
    clearCity();
    const city = layoutCity(data ?? EMPTY_CITY);
    layout = city;
    gapMarkers = buildGround(parts, city, palette);
    const built = buildBuildings(
      parts.cityGroup,
      parts.routeGroup,
      overlay,
      leaders,
      city,
      palette,
      windowTexes,
      opt.formatCount,
    );
    views = built.views;
    routes = built.routes;
    pickTargets = built.pickTargets;
    parts.disposables.push(...built.disposables);
    indexOf = new Map(views.map((v, i) => [v.data.id, i] as const));
    if (opt.labels) {
      makeDistrictLabels(city);
      makeGapLabels();
    }
    if (opt.outskirts && !lanes.length) lanes = buildOutskirts(parts, palette);
    if (opt.traffic && lanes.length && !traffic)
      traffic = createTraffic(
        parts.scene,
        lanes,
        TRAFFIC_CARS,
        parts.disposables,
      );
    if (opt.ambient)
      ambient = createAmbient(parts.scene, views, parts.disposables);
    if (opt.construction)
      site = buildConstruction(parts.constrGroup, city, views, palette);
    // 건물은 높이 0으로 만들어진다. 연출을 끄면 바로 세운다
    const rise = opt.riseSeconds ?? 2.6;
    if (rise > 0 && opt.construction) {
      riseT = 0;
      parts.constrGroup.visible = true;
    } else {
      riseT = -1;
      for (const v of views) v.group.scale.y = 1;
      parts.constrGroup.visible = false;
    }
    refreshLook();
    events.emit('view', viewState());
  }

  /** 활성도에 따라 창 조명과 포인트 색을 다시 칠한다 */
  function refreshLook(): void {
    for (const v of views) {
      const b = v.data;
      const dim = highlight ? !highlight.has(b.id) : false;
      const lit = b.activity >= threshold ? b.activity : 0;
      const level = windowLevelFor(dim ? lit * 0.25 : lit);
      if (level !== v.winLevel) setWindowLevel(v, level);
      const accent = new Color(v.accent);
      if (dim) accent.lerp(palette.pale, 0.75);
      else if (lit < 0.35) accent.lerp(palette.pale, 0.55 - lit);
      for (const m of v.accentMats) m.color.copy(accent);
      for (const m of v.glassMats)
        m.emissiveIntensity = night ? 0.55 : 0.12 + lit * 0.2;
      ambient?.setState(indexOf.get(v.data.id) ?? 0, lit, !dim);
    }
    for (const r of routes) {
      const on =
        !highlight || highlight.has(r.route.aId) || highlight.has(r.route.bId);
      for (const line of r.lines) {
        const mat = line.material as { color?: Color; opacity?: number };
        mat.color?.copy(on ? palette.routeHi : palette.route);
        if (mat.opacity !== undefined) mat.opacity = on ? 0.9 : 0.35;
      }
    }
  }

  function viewState(): CityRendererEvents['view'] {
    const tier = tierOf(orbit.zoom);
    return {
      tier,
      tierName: TIERS[tier]?.name ?? '',
      scale: scaleLabel(orbit.zoom, size().h),
      zoom: orbit.zoom,
    };
  }

  function ensureSelRing(): Mesh<RingGeometry, MeshBasicMaterial> {
    if (selRing) return selRing;
    const geo = new RingGeometry(1, 1.12, 40);
    const mat = new MeshBasicMaterial({
      color: palette.routeHi,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const m = new Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    parts.scene.add(m);
    selRing = m;
    return m;
  }

  function markSelected(b: Building | null): void {
    const ring = ensureSelRing();
    if (!b) {
      ring.visible = false;
      return;
    }
    const r = Math.max(b.bw, b.bd) * 0.78;
    ring.scale.set(r, r, r);
    ring.position.set(b.at[0], 0.6, b.at[1]);
    ring.visible = true;
  }

  /** 화면 좌표에서 건물을 집는다 */
  function pick(cx: number, cy: number): Building | null {
    const s = size();
    mouse.set(((cx - s.left) / s.w) * 2 - 1, -((cy - s.top) / s.h) * 2 + 1);
    ray.setFromCamera(mouse, parts.camera);
    const hit = ray.intersectObjects(pickTargets, false)[0];
    const id = hit?.object.userData?.['id'];
    return typeof id === 'string'
      ? (layout?.buildingById.get(id) ?? null)
      : null;
  }

  // ─────────────────────────── 조작
  const pointers = new Map<number, { x: number; y: number }>();
  let dragging = false;
  let dragRotates = false;
  let moved = false;
  let last = { x: 0, y: 0 };
  let pinchDist = 0;

  const onPointerDown = (e: PointerEvent): void => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(
        (a?.x ?? 0) - (b?.x ?? 0),
        (a?.y ?? 0) - (b?.y ?? 0),
      );
      return;
    }
    dragging = true;
    moved = false;
    dragRotates = e.shiftKey || e.button === 2;
    last = { x: e.clientX, y: e.clientY };
    lastInteract = performance.now();
    parts.renderer.domElement.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent): void => {
    if (pointers.has(e.pointerId))
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(
        (a?.x ?? 0) - (b?.x ?? 0),
        (a?.y ?? 0) - (b?.y ?? 0),
      );
      if (pinchDist > 0) orbit.tZoom = clampZoom(orbit.tZoom * (d / pinchDist));
      pinchDist = d;
      lastInteract = performance.now();
      return;
    }
    if (dragging) {
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      last = { x: e.clientX, y: e.clientY };
      if (dragRotates) applyDrag(orbit, dx, dy);
      else applyPan(orbit, dx, dy, size().h);
      lastInteract = performance.now();
      return;
    }
    const b = pick(e.clientX, e.clientY);
    if (b !== hovered) {
      hovered = b;
      parts.renderer.domElement.style.cursor = b ? 'pointer' : 'grab';
      events.emit('hover', b);
    }
  };
  const onPointerUp = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    if (!dragging) return;
    dragging = false;
    if (!moved) {
      const b = pick(e.clientX, e.clientY);
      selected = b;
      markSelected(b);
      events.emit('select', b);
      if (b) zoomToPoint(orbit, b.at[0], b.at[1], Math.max(orbit.tZoom, 1.9));
    }
  };
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    applyWheel(orbit, e.deltaY);
    lastInteract = performance.now();
  };
  const onResize = (): void => {
    invalidate();
    resizeScene(parts, container);
    const s = size();
    sizeCamera(parts.camera, orbit.zoom, s.w, s.h, insets);
    leaders.setAttribute('viewBox', `0 0 ${s.w} ${s.h}`);
  };

  const canvas = parts.renderer.domElement;
  canvas.style.touchAction = 'none';
  canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  const ro =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => onResize())
      : null;
  ro?.observe(container);
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', invalidate, true);

  // ─────────────────────────── 라벨 배치
  function placeLabels(): void {
    if (!opt.labels) return;
    const s = size();
    const tier = tierOf(orbit.zoom);
    // 화면 중앙에 가까운 건물부터, 서로 겹치지 않는 만큼만 띄운다
    const cands = views
      .map((v) => {
        tmp.set(v.data.at[0], v.totalH * v.group.scale.y + 10, v.data.at[1]);
        const p = project(tmp, parts.camera, s.w, s.h, { x: 0, y: 0, z: 0 });
        return { v, p, d: Math.hypot(p.x - s.w / 2, p.y - s.h / 2) };
      })
      .filter((o) => o.p.z < 1)
      .sort((a, b) => a.d - b.d);
    const boxes: { x: number; y: number; w: number; h: number }[] = [];
    let shown = 0;
    for (const { v, p } of cands) {
      const wantsLabel =
        tier >= 1 &&
        shown < LABEL_MAX &&
        (!highlight || highlight.has(v.data.id));
      const lx = p.x + 12;
      const ly = p.y - 26;
      const box = { x: lx, y: ly, w: 150, h: 34 };
      const clash = boxes.some(
        (o) =>
          Math.abs(o.x - box.x) < (o.w + box.w) / 2 &&
          Math.abs(o.y - box.y) < (o.h + box.h) / 2,
      );
      const on = wantsLabel && !clash;
      if (on) {
        boxes.push(box);
        shown++;
        v.label.style.left = `${lx}px`;
        v.label.style.top = `${ly}px`;
        v.leader.setAttribute('x1', String(p.x + 3));
        v.leader.setAttribute('y1', String(p.y - 2));
        v.leader.setAttribute('x2', String(lx));
        v.leader.setAttribute('y2', String(ly + 16));
      }
      toggleClass(v.label, 'on', on);
      toggleClass(v.leader, 'on', on);
      toggleClass(v.label, 'hi', selected?.id === v.data.id);
    }
    for (const gl of gapLabels) {
      const p = project(gl.pos, parts.camera, s.w, s.h, scr);
      const on = tier >= 2 && p.z < 1;
      if (on) {
        gl.el.style.left = `${p.x}px`;
        gl.el.style.top = `${p.y}px`;
      }
      toggleClass(gl.el, 'on', on);
    }
    for (const dl of districtLabels) {
      const p = project(dl.pos, parts.camera, s.w, s.h, scr);
      const on = tier <= 0 && p.z < 1;
      if (on) {
        dl.el.style.left = `${p.x}px`;
        dl.el.style.top = `${p.y}px`;
      }
      toggleClass(dl.el, 'on', on);
    }
  }

  // ─────────────────────────── 루프
  function frame(now: number): void {
    raf = requestAnimationFrame(frame);
    const dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 1 / 60;
    lastFrame = now;
    const t = (now - startedAt) / 1000;
    const s = size();
    if (autoRotate && now - lastInteract > CAMERA.autoRotateDelayMs)
      orbit.tTheta += CAMERA.autoRotate;
    tickOrbit(orbit, parts.camera, s.w, s.h, dt, insets);
    if (riseT >= 0) {
      const rise = opt.riseSeconds ?? 2.6;
      riseT += dt;
      const progress = Math.min(1, riseT / rise);
      const total = views.length;
      views.forEach((v, i) => {
        // 구역 순서대로 조금씩 늦게 올라온다
        const delay = (i / Math.max(1, total)) * 0.45;
        const k = Math.max(0, Math.min(1, (progress - delay) / 0.55));
        v.group.scale.y = Math.max(0.001, 1 - Math.pow(1 - k, 3));
      });
      if (progress >= 1) {
        riseT = -1;
        for (const v of views) v.group.scale.y = 1;
        parts.constrGroup.visible = false;
      }
    }
    traffic?.update(dt, night);
    ambient?.update(t, night);
    if (site) animateConstruction(site, t);
    parts.routeGroup.visible = tierOf(orbit.zoom) >= 3 || !!highlight;
    placeLabels();
    const st = viewState();
    if (st.tier !== lastTier || st.scale !== lastScale) {
      lastTier = st.tier;
      lastScale = st.scale;
      events.emit('view', st);
    }
    parts.renderer.render(parts.scene, parts.camera);
  }

  const api: CityRenderer = {
    setData,
    getLayout: () => layout,
    focusBuilding(id, zoom = 2.1) {
      const b = layout?.buildingById.get(id);
      if (!b) return;
      lastInteract = performance.now();
      selected = b;
      markSelected(b);
      zoomToPoint(orbit, b.at[0], b.at[1], zoom);
    },
    focusDistrict(id) {
      const d = layout?.districtById.get(id);
      if (!d) return;
      lastInteract = performance.now();
      zoomToPoint(orbit, d.at[0], d.at[1], TIERS[1]?.zoom ?? 1.15);
    },
    home() {
      lastInteract = performance.now();
      selected = null;
      markSelected(null);
      resetOrbit(orbit);
    },
    zoomBy(factor) {
      lastInteract = performance.now();
      orbit.tZoom = clampZoom(orbit.tZoom * (factor || ZOOM_STEP));
    },
    setZoom(zoom) {
      lastInteract = performance.now();
      orbit.tZoom = clampZoom(zoom);
    },
    setNight(on) {
      night = on;
      applyPalette(parts, palette, night);
      refreshLook();
    },
    setAutoRotate(on) {
      autoRotate = on;
    },
    setHighlight(ids) {
      highlight = ids ? new Set(ids) : null;
      refreshLook();
    },
    setActivityThreshold(t) {
      threshold = Math.max(0, Math.min(1, t));
      refreshLook();
    },
    setPalette(input) {
      palette = createPalette(input);
      applyPalette(parts, palette, night);
      refreshLook();
    },
    resize: onResize,
    start() {
      if (running) return;
      running = true;
      startedAt = performance.now();
      lastFrame = 0;
      lastInteract = startedAt;
      onResize();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    dispose() {
      api.stop();
      clearCity();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      ro?.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', invalidate, true);
      for (const tex of windowTexes) tex.dispose();
      overlay.remove();
      leaders.remove();
      disposeScene(parts);
      events.clear();
    },
    on: (event, fn) => events.on(event, fn),
    canvas,
  };

  applyPalette(parts, palette, night);
  onResize();
  return api;
}
