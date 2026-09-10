import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  EdgesGeometry,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Material,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  PlaneGeometry,
  RepeatWrapping,
  SphereGeometry,
  Vector3,
} from 'three';
import type { CityLayout, Building, Route } from './layout';
import { CITY, FORMS, floorsFor } from './constants';
import type { Palette } from './palette';

/** 창 조명 단계 수 — 활성도에 따라 켜진 창의 비율이 달라진다 */
export const WINDOW_LEVELS = 4;

/** 본체 높이에 따라 자리를 다시 잡는 외장 요소 (수평 핀·루버 등) */
interface FacadePiece {
  mesh: Mesh;
  /** 본체 높이의 몇 % 지점에 놓는가 */
  yFrac: number;
}

export interface BuildingView {
  data: Building;
  group: Group;
  podium: Mesh<BufferGeometry, MeshStandardMaterial> | null;
  main: Mesh<BufferGeometry, MeshStandardMaterial>;
  upper: Mesh<BufferGeometry, MeshStandardMaterial> | null;
  crown: Mesh<BufferGeometry, MeshStandardMaterial> | null;
  annex: Mesh<BufferGeometry, MeshStandardMaterial>[];
  cap: LineSegments;
  /** 본체 옥상 — 창문 없는 바닥판과 환풍기·정자·조경 소품 */
  roofMain: Group;
  /** 상층부 옥상 (setback 형태에만) */
  roofUpper: Group | null;
  /** 지구 양식 소품 — 꼭대기에 얹는 마스트·드럼·안테나 */
  kitTop: Group;
  /** 소품 높이 (라벨을 그 위에 띄우기 위해) */
  kitH: number;
  /** 본체 옆면을 따라 세운 요소 — 본체 높이만큼 늘인다 (배관 등) */
  risers: Mesh[];
  /** 본체 높이 비율 위치에 놓는 요소 */
  facade: FacadePiece[];
  /** 지구 색을 입힌 재질 — 활성도에 따라 옅어진다 */
  accentMats: MeshStandardMaterial[];
  /** 유리 재질 — 창처럼 은은히 빛난다 */
  glassMats: MeshStandardMaterial[];
  /** 서버센터 안테나 끝의 경고등 (천천히 깜빡인다) */
  beacon: MeshStandardMaterial | null;
  /** 지구 색 */
  accent: Color;
  /** 창 조명 단계별 텍스처 (켜진 창 비율 25 → 100%) */
  winTex: CanvasTexture[];
  /** 현재 적용된 창 조명 단계 */
  winLevel: number;
  /** 현재 본체 높이 */
  mainH: number;
  /** 옥탑·소품까지 총 높이 */
  totalH: number;
  /** 라벨 DOM */
  label: HTMLDivElement;
  leader: SVGLineElement;
}

export interface RouteView {
  route: Route;
  lines: Line[];
}

/** 켜지는 순서 — 같은 단계면 늘 같은 창이 켜져 있어 깜빡이지 않는다 */
const LIGHT_ORDER = [0, 5, 2, 7, 1, 4, 6, 3];

/**
 * 창문 텍스처 — 검은 바탕에 흰 창. emissiveMap 으로 쓴다.
 * 타일 하나에 창 4×2. 단계가 오를수록 켜진 창이 늘어 활발한 건물이 더 밝아 보인다.
 */
export function createWindowTextures(): CanvasTexture[] {
  const out: CanvasTexture[] = [];
  for (let level = 0; level < WINDOW_LEVELS; level++) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d');
    if (g) {
      g.fillStyle = '#000';
      g.fillRect(0, 0, 64, 64);
      const litCount = Math.ceil(((level + 1) / WINDOW_LEVELS) * 8);
      const lit = new Set(LIGHT_ORDER.slice(0, litCount));
      for (let r = 0; r < 2; r++) {
        for (let col = 0; col < 4; col++) {
          const i = r * 4 + col;
          g.fillStyle = lit.has(i) ? '#fff' : '#1a1a1a';
          g.fillRect(4 + col * 16, 6 + r * 32, 9, 14);
        }
      }
    }
    const t = new CanvasTexture(c);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.magFilter = NearestFilter;
    out.push(t);
  }
  return out;
}

/** 층수에 맞춘 창 반복 — 가로 6줄, 층마다 창 한 줄 */
export function windowRepeat(count: number): [number, number] {
  return [1.5, Math.max(1.5, Math.round(floorsFor(count) * 0.5 * 2) / 2)];
}

/** 매스 하나의 크기·위치를 항목량에서 다시 계산한다 */
export function layoutBuilding(v: BuildingView, mainH: number): void {
  const f = FORMS[v.data.form];
  const pod = v.data.podH;
  const w = v.data.bw;
  const d = v.data.bd;
  v.main.scale.set(f.mainW * w, mainH, f.mainD * d);
  v.main.position.set(0, pod + mainH / 2, 0);
  let top = pod + mainH;
  // 옥상은 매스 꼭대기에 얹는다 (증축으로 높이가 바뀌어도 따라간다)
  v.roofMain.position.y = top;
  if (v.upper && f.upper) {
    const uh = mainH * f.upper;
    v.upper.scale.set((f.upperW ?? 0.6) * w, uh, (f.upperD ?? 0.6) * d);
    v.upper.position.set(0, top + uh / 2, 0);
    top += uh;
    if (v.roofUpper) v.roofUpper.position.y = top;
  }
  if (v.crown && f.crown) {
    v.crown.scale.set((f.crownW ?? 0.34) * w, f.crown, (f.crownD ?? 0.34) * d);
    v.crown.position.set(0, top + f.crown / 2, 0);
    top += f.crown;
  }
  v.cap.position.y = top + 0.35;
  v.kitTop.position.y = top;
  for (const r of v.risers) {
    r.scale.y = mainH;
    r.position.y = pod + mainH / 2;
  }
  for (const p of v.facade) p.mesh.position.y = pod + p.yFrac * mainH;
  v.mainH = mainH;
  v.totalH = top + v.kitH;
}

export interface BuildBuildingsResult {
  views: BuildingView[];
  routes: RouteView[];
  /** 레이캐스트 대상 매스 */
  pickTargets: Mesh[];
  disposables: (BufferGeometry | Material)[];
}

/**
 * 도시 건물과 통행로를 만든다. 라벨 DOM 도 여기서 만들어 오버레이에 붙인다.
 *
 * 외장은 중립 회청색 하나로 통일하고 지구 색은 옥상·왕관·입구 캐노피·소품·유리에만 쓴다.
 * 그래서 도시 전체는 차분하고, 색은 "어느 지구인가"만 가리킨다.
 */
export function buildBuildings(
  cityGroup: Group,
  routeGroup: Group,
  overlay: HTMLElement,
  leaders: SVGSVGElement,
  city: CityLayout,
  palette: Palette,
  windowTexes: CanvasTexture[],
  /** 라벨에 붙는 항목 수 표기. 기본은 숫자만 */
  formatCount: (n: number) => string = (n) => String(n),
): BuildBuildingsResult {
  const boxGeo = new BoxGeometry(1, 1, 1);
  const cylGeo = new CylinderGeometry(1, 1, 1, 14);
  const sphereGeo = new SphereGeometry(1, 10, 8);
  const disposables: (BufferGeometry | Material)[] = [
    boxGeo,
    cylGeo,
    sphereGeo,
  ];
  const roofMats = {
    steel: new MeshStandardMaterial({
      color: palette.eqSteel,
      roughness: 0.7,
      metalness: 0.2,
    }),
    white: new MeshStandardMaterial({ color: palette.eqWhite, roughness: 0.6 }),
    wood: new MeshStandardMaterial({ color: palette.trunk, roughness: 0.9 }),
    bench: new MeshStandardMaterial({ color: palette.cap, roughness: 0.8 }),
    planter: new MeshStandardMaterial({
      color: palette.eqDark,
      roughness: 0.9,
    }),
    green: new MeshStandardMaterial({ color: palette.leaf, roughness: 0.95 }),
    dark: new MeshStandardMaterial({ color: palette.eqDark, roughness: 0.8 }),
  };
  Object.values(roofMats).forEach((m) => disposables.push(m));
  const views: BuildingView[] = [];
  const pickTargets: Mesh[] = [];
  const SVGNS = 'http://www.w3.org/2000/svg';

  city.buildings.forEach((b, idx) => {
    const hue = city.districtById.get(b.districtId)?.hue ?? 0x27a6ee;
    const accent = new Color(hue);
    const base = palette.bldg.clone();
    const accentMats: MeshStandardMaterial[] = [];
    const glassMats: MeshStandardMaterial[] = [];
    const risers: Mesh[] = [];
    const facade: FacadePiece[] = [];
    let beacon: MeshStandardMaterial | null = null;

    const makeMass = (tex: CanvasTexture | null, shade: number) => {
      const mat = new MeshStandardMaterial({
        color: base.clone().multiplyScalar(shade),
        roughness: 0.62,
        metalness: 0.06,
        emissive: 0x000000,
        emissiveMap: tex,
        emissiveIntensity: 0,
      });
      disposables.push(mat);
      const m = new Mesh(boxGeo, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.id = b.id;
      pickTargets.push(m);
      return m;
    };
    const accentMat = (shade = 1) => {
      const m = new MeshStandardMaterial({
        color: accent.clone().multiplyScalar(shade),
        roughness: 0.55,
        metalness: 0.1,
      });
      disposables.push(m);
      accentMats.push(m);
      return m;
    };
    const glassMat = () => {
      const m = new MeshStandardMaterial({
        color: palette.glass.clone().lerp(accent, 0.25),
        roughness: 0.15,
        metalness: 0.1,
        transparent: true,
        opacity: 0.62,
        emissive: accent.clone(),
        emissiveIntensity: 0.1,
      });
      disposables.push(m);
      glassMats.push(m);
      return m;
    };
    /** 소품 상자 — 부모 그룹 바닥(y=0) 위에 세운다 */
    const prop = (
      parent: Group,
      geo: BufferGeometry,
      mat: Material,
      sx: number,
      sy: number,
      sz: number,
      x: number,
      z: number,
      y = sy / 2,
    ) => {
      const m = new Mesh(geo, mat);
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };

    const group = new Group();
    group.position.set(b.at[0], 0, b.at[1]);
    group.rotation.y = b.rotY;
    group.scale.y = 0.001;
    cityGroup.add(group);

    const [rx, ry] = windowRepeat(b.count);
    const winTex = windowTexes.map((t) => {
      const c = t.clone();
      c.needsUpdate = true;
      c.repeat.set(rx, ry);
      disposables.push(c as unknown as Material);
      return c;
    });
    const startLevel = 1;

    const f = FORMS[b.form];
    const w = f.mainW * b.bw;
    const d = f.mainD * b.bd;
    const u = Math.min(w, d) * 0.07; // 소품 기준 크기

    let podium: BuildingView['podium'] = null;
    if (b.podH) {
      podium = makeMass(null, 0.86);
      podium.scale.set((f.podW ?? 1) * b.bw, b.podH, (f.podD ?? 1) * b.bd);
      podium.position.y = b.podH / 2;
      group.add(podium);
    }
    const main = makeMass(winTex[startLevel] ?? null, 1);
    group.add(main);
    let upper: BuildingView['upper'] = null;
    if (f.upper) {
      const upTex = (winTex[startLevel] ?? winTex[0])!.clone();
      upTex.repeat.set(1, 1.5);
      disposables.push(upTex as unknown as Material);
      upper = makeMass(upTex, 1);
      group.add(upper);
    }
    // 왕관은 지구 색 포인트
    let crown: BuildingView['crown'] = null;
    if (f.crown) {
      const cm = accentMat(0.92);
      crown = new Mesh(boxGeo, cm) as Mesh<
        BufferGeometry,
        MeshStandardMaterial
      >;
      crown.castShadow = true;
      crown.userData.id = b.id;
      pickTargets.push(crown);
      group.add(crown);
    }

    const capGeo = new EdgesGeometry(
      new PlaneGeometry(
        (f.crownW ?? f.mainW) * b.bw,
        (f.crownD ?? f.mainD) * b.bd,
      ),
    );
    const capMat = new LineBasicMaterial({ color: accent.clone() });
    disposables.push(capGeo, capMat);
    const cap = new LineSegments(capGeo, capMat);
    cap.rotation.x = -Math.PI / 2;
    group.add(cap);

    /**
     * 옥상 — 창문 텍스처가 위 면에도 찍히므로 바닥판으로 덮고, 그 위에 소품을 얹는다.
     * 바닥판은 어두운 중립색에 지구 색을 조금 섞는다. 소품은 네 모서리에 두고
     * 건물마다 조합을 돌려 같은 지붕이 반복되지 않게 한다.
     */
    const makeRoof = (
      rw: number,
      rd: number,
      holeW: number,
      holeD: number,
      variant: number,
    ): Group => {
      const roof = new Group();
      const roofMat = new MeshStandardMaterial({
        color: base.clone().multiplyScalar(0.55).lerp(accent, 0.38),
        roughness: 0.9,
      });
      disposables.push(roofMat);
      const slab = new Mesh(boxGeo, roofMat);
      slab.scale.set(rw * 0.995, 0.5, rd * 0.995);
      slab.position.y = 0.25;
      slab.receiveShadow = true;
      roof.add(slab);
      // 난간
      const rail = new LineSegments(
        new EdgesGeometry(new PlaneGeometry(rw * 0.96, rd * 0.96)),
        new LineBasicMaterial({ color: palette.cap.clone() }),
      );
      disposables.push(rail.geometry, rail.material as Material);
      rail.rotation.x = -Math.PI / 2;
      rail.position.y = 1.1;
      roof.add(rail);

      const rp = (
        mat: MeshStandardMaterial,
        sx: number,
        sy: number,
        sz: number,
        x: number,
        z: number,
      ) => prop(roof, boxGeo, mat, sx, sy, sz, x, z, 0.5 + sy / 2);
      const steel = roofMats.steel;
      const ru = Math.min(rw, rd) * 0.07;
      const corners: [number, number][] = [
        [0.41, 0.4],
        [-0.41, 0.4],
        [0.41, -0.4],
        [-0.41, -0.4],
      ];
      // 중앙 상층부와 겹치는 모서리는 비운다
      const free = corners.filter(
        ([cx, cz]) =>
          Math.abs(cx * rw) - ru * 1.3 > holeW / 2 ||
          Math.abs(cz * rd) - ru * 1.3 > holeD / 2,
      );
      free.forEach(([cx, cz], i) => {
        const kind = (i + variant) % 4;
        const x = cx * rw;
        const z = cz * rd;
        if (kind === 0) {
          // 외부 환풍기 두 대 — 몸체 위에 팬 덮개
          for (const off of [-0.9, 0.9]) {
            rp(steel, ru * 1.4, ru * 0.9, ru * 1.1, x + off * ru, z);
            rp(
              roofMats.white,
              ru * 1.0,
              ru * 0.18,
              ru * 0.8,
              x + off * ru,
              z + 0.001,
            ).position.y = 0.5 + ru * 0.99;
          }
        } else if (kind === 1) {
          // 정자 — 기둥 넷과 지붕, 아래 벤치
          const ph = ru * 1.9;
          for (const sx of [-1, 1])
            for (const sz of [-1, 1])
              rp(
                roofMats.wood,
                ru * 0.16,
                ph,
                ru * 0.16,
                x + sx * ru * 0.9,
                z + sz * ru * 0.8,
              );
          rp(roofMats.wood, ru * 2.3, ru * 0.14, ru * 2.0, x, z).position.y =
            0.5 + ph + ru * 0.07;
          rp(
            roofMats.bench,
            ru * 1.4,
            ru * 0.14,
            ru * 0.4,
            x,
            z + ru * 0.35,
          ).position.y = 0.5 + ru * 0.55;
        } else if (kind === 2) {
          // 조경 — 화단 두 줄
          for (const off of [-0.55, 0.55]) {
            rp(roofMats.planter, ru * 2.2, ru * 0.3, ru * 0.7, x, z + off * ru);
            rp(
              roofMats.green,
              ru * 2.0,
              ru * 0.5,
              ru * 0.55,
              x,
              z + off * ru,
            ).position.y = 0.5 + ru * 0.55;
          }
        } else {
          // 물탱크 하나와 벤치
          rp(steel, ru * 1.1, ru * 1.5, ru * 1.1, x - ru * 0.5, z);
          rp(
            roofMats.white,
            ru * 1.2,
            ru * 0.12,
            ru * 1.2,
            x - ru * 0.5,
            z,
          ).position.y = 0.5 + ru * 1.56;
          rp(
            roofMats.bench,
            ru * 0.4,
            ru * 0.14,
            ru * 1.3,
            x + ru * 0.9,
            z,
          ).position.y = 0.5 + ru * 0.45;
        }
      });
      return roof;
    };
    const roofMain = makeRoof(
      w,
      d,
      f.upper
        ? (f.upperW ?? 0.6) * b.bw
        : f.crown
          ? (f.crownW ?? 0.34) * b.bw
          : 0,
      f.upper
        ? (f.upperD ?? 0.6) * b.bd
        : f.crown
          ? (f.crownD ?? 0.34) * b.bd
          : 0,
      idx,
    );
    group.add(roofMain);
    let roofUpper: Group | null = null;
    if (f.upper) {
      roofUpper = makeRoof(
        (f.upperW ?? 0.6) * b.bw,
        (f.upperD ?? 0.6) * b.bd,
        f.crown ? (f.crownW ?? 0.34) * b.bw : 0,
        f.crown ? (f.crownD ?? 0.34) * b.bd : 0,
        idx + 2,
      );
      group.add(roofUpper);
    }

    // 별관 — 중립색, 캠퍼스 양식은 브릿지로 본체와 잇는다
    const annex: BuildingView['annex'] = [];
    const spots: [number, number][] = [
      [0.62, 0.52],
      [-0.66, 0.46],
      [0.58, -0.56],
      [-0.58, -0.5],
    ];
    for (let i = 0; i < b.annexCount; i++) {
      const a = makeMass(null, 0.92);
      const hh = CITY.unitH * (1.2 + ((i * 7) % 3) * 0.5);
      const spot = spots[i] ?? spots[0]!;
      const ax = spot[0] * b.bw * 0.9;
      const az = spot[1] * b.bd * 1.05;
      a.scale.set(b.bw * 0.3, hh, b.bd * 0.32);
      a.position.set(ax, hh / 2, az);
      group.add(a);
      annex.push(a);
      if (b.style === 'campus') {
        // 본체 중심에서 별관 중심까지 잇는 유리 브릿지 (본체 안쪽 구간은 매스에 가려진다)
        const len = Math.hypot(ax, az);
        const bridge = new Mesh(boxGeo, glassMat());
        bridge.scale.set(len, u * 0.9, u * 0.9);
        bridge.position.set(ax / 2, hh * 0.62, az / 2);
        bridge.rotation.y = -Math.atan2(az, ax);
        group.add(bridge);
      }
    }

    // 입구 캐노피 — 지구 색. 방문자 센터(lobby)는 더 넓게
    const front = d / 2;
    const canopyW = b.style === 'lobby' ? w * 0.72 : w * 0.36;
    const canopyH = u * 1.9;
    prop(
      group,
      boxGeo,
      accentMat(),
      canopyW,
      u * 0.35,
      u * 1.7,
      0,
      front + u * 0.85,
      canopyH,
    );
    for (const sx of [-1, 1])
      prop(
        group,
        boxGeo,
        roofMats.steel,
        u * 0.18,
        canopyH,
        u * 0.18,
        sx * canopyW * 0.44,
        front + u * 1.5,
      );

    // 지구 양식 소품
    const kitTop = new Group();
    group.add(kitTop);
    let kitH = 0;
    if (b.style === 'lab') {
      // 연구소 — 옥상 유리 드럼, 옆면 배관 세 줄, 층을 가르는 수평 핀 두 줄
      const drumR = Math.min(u * 1.7, (f.crownW ?? f.mainW) * b.bw * 0.42);
      prop(kitTop, cylGeo, glassMat(), drumR, u * 2.2, drumR, 0, 0);
      prop(
        kitTop,
        cylGeo,
        roofMats.steel,
        drumR * 1.05,
        u * 0.2,
        drumR * 1.05,
        0,
        0,
        u * 2.3,
      );
      kitH = u * 2.5;
      for (const oz of [-0.28, 0, 0.28]) {
        const pipe = new Mesh(cylGeo, roofMats.steel);
        pipe.scale.set(u * 0.2, 1, u * 0.2);
        pipe.position.set(-w / 2 - u * 0.22, 0, oz * d);
        pipe.castShadow = true;
        group.add(pipe);
        risers.push(pipe);
      }
      for (const yf of [0.36, 0.7]) {
        const fin = new Mesh(boxGeo, accentMat(0.9));
        fin.scale.set(w * 1.04, u * 0.22, d * 1.04);
        group.add(fin);
        facade.push({ mesh: fin, yFrac: yf });
      }
    } else if (b.style === 'lobby') {
      // 방문자 센터 — 1층을 감싸는 유리 로비. 포디움이 있으면 포디움 자체를 유리로 바꾼다
      if (podium) {
        podium.material = glassMat();
      } else {
        prop(group, boxGeo, glassMat(), w * 1.16, u * 2.3, d * 1.16, 0, 0);
      }
      // 깃대 둘
      for (const sx of [-1, 1]) {
        prop(
          group,
          cylGeo,
          roofMats.steel,
          u * 0.12,
          u * 4.2,
          u * 0.12,
          sx * w * 0.42,
          front + u * 3.2,
        );
        prop(
          group,
          boxGeo,
          accentMat(),
          u * 0.9,
          u * 0.55,
          u * 0.06,
          sx * w * 0.42 + sx * u * 0.45,
          front + u * 3.2,
          u * 3.9,
        );
      }
    } else if (b.style === 'control') {
      // 관제탑 — 중앙 마스트와 링, 옥상 네 모서리의 기둥
      prop(kitTop, cylGeo, roofMats.steel, u * 0.28, u * 4.2, u * 0.28, 0, 0);
      prop(
        kitTop,
        cylGeo,
        accentMat(),
        u * 1.5,
        u * 0.22,
        u * 1.5,
        0,
        0,
        u * 3.4,
      );
      prop(
        kitTop,
        cylGeo,
        roofMats.white,
        u * 0.6,
        u * 0.3,
        u * 0.6,
        0,
        0,
        u * 4.2,
      );
      kitH = u * 4.4;
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          prop(
            roofMain,
            boxGeo,
            accentMat(0.95),
            u * 0.4,
            u * 1.6,
            u * 0.4,
            sx * w * 0.47,
            sz * d * 0.47,
            0.5 + u * 0.8,
          );
    } else if (b.style === 'server') {
      // 서버센터 — 안테나 마스트와 접시 둘, 끝에 경고등. 옆면에는 루버 세 줄
      prop(kitTop, cylGeo, roofMats.steel, u * 0.22, u * 3.8, u * 0.22, 0, 0);
      for (const [sx, yy] of [
        [1, 1.6],
        [-1, 2.6],
      ] as const) {
        const dish = prop(
          kitTop,
          cylGeo,
          roofMats.white,
          u * 0.85,
          u * 0.14,
          u * 0.85,
          sx * u * 0.75,
          0,
          u * yy,
        );
        dish.rotation.z = sx * 0.95;
      }
      const bm = new MeshStandardMaterial({
        color: palette.eqRed,
        emissive: palette.eqRed.clone(),
        emissiveIntensity: 0.6,
      });
      disposables.push(bm);
      beacon = bm;
      prop(kitTop, sphereGeo, bm, u * 0.3, u * 0.3, u * 0.3, 0, 0, u * 3.9);
      kitH = u * 4.1;
      for (const yf of [0.25, 0.5, 0.75]) {
        const louver = new Mesh(boxGeo, roofMats.dark);
        louver.scale.set(u * 0.22, u * 0.55, d * 0.72);
        louver.position.x = w / 2 + u * 0.11;
        group.add(louver);
        facade.push({ mesh: louver, yFrac: yf });
      }
    } else {
      // 캠퍼스 — 뒷마당 화단과 정자 지붕. 브릿지는 별관에서 이미 이었다
      prop(
        group,
        boxGeo,
        roofMats.planter,
        w * 0.7,
        u * 0.3,
        u * 0.8,
        0,
        -front - u * 1.0,
      );
      prop(
        group,
        boxGeo,
        roofMats.green,
        w * 0.66,
        u * 0.5,
        u * 0.65,
        0,
        -front - u * 1.0,
        u * 0.55,
      );
      prop(
        kitTop,
        boxGeo,
        accentMat(0.9),
        u * 2.2,
        u * 0.18,
        u * 2.2,
        0,
        0,
        u * 1.5,
      );
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          prop(
            kitTop,
            boxGeo,
            roofMats.wood,
            u * 0.16,
            u * 1.5,
            u * 0.16,
            sx * u * 0.9,
            sz * u * 0.9,
          );
      kitH = u * 1.6;
    }

    const label = document.createElement('div');
    label.className = 'vs-building';
    const nameEl = document.createElement('b');
    nameEl.textContent = b.name;
    const cntEl = document.createElement('span');
    cntEl.textContent = formatCount(b.count);
    label.append(nameEl, cntEl);
    label.style.setProperty(
      '--accent',
      `#${hue.toString(16).padStart(6, '0')}`,
    );
    overlay.appendChild(label);
    const leader = document.createElementNS(SVGNS, 'line');
    leaders.appendChild(leader);

    const view: BuildingView = {
      data: b,
      group,
      podium,
      main,
      upper,
      crown,
      annex,
      cap,
      roofMain,
      roofUpper,
      kitTop,
      kitH,
      risers,
      facade,
      accentMats,
      glassMats,
      beacon,
      accent,
      winTex,
      winLevel: startLevel,
      mainH: b.mainH,
      totalH: b.mainH,
      label,
      leader,
    };
    layoutBuilding(view, b.mainH);
    views.push(view);
  });

  // 통행로 — 가중치가 크면 차선을 늘린다
  const routes: RouteView[] = [];
  for (const r of city.routes) {
    const a = city.buildingById.get(r.aId);
    const b = city.buildingById.get(r.bId);
    if (!a || !b) continue;
    const lanes = r.weight >= 6 ? 3 : r.weight >= 3 ? 2 : 1;
    const lines: Line[] = [];
    for (let k = 0; k < lanes; k++) {
      const off = (k - (lanes - 1) / 2) * 2.4;
      const pts = [
        new Vector3(a.at[0] + off, 0.9, a.at[1] + off),
        new Vector3(b.at[0] + off, 0.9, a.at[1] + off),
        new Vector3(b.at[0] + off, 0.9, b.at[1] + off),
      ];
      const geo = new BufferGeometry().setFromPoints(pts);
      const mat = new LineBasicMaterial({
        color: palette.route.clone(),
        transparent: true,
        opacity: 0.55,
      });
      disposables.push(geo, mat);
      const line = new Line(geo, mat);
      routeGroup.add(line);
      lines.push(line);
    }
    routes.push({ route: r, lines });
  }

  return { views, routes, pickTargets, disposables };
}

/** 활성도 → 창 조명 단계 (0~WINDOW_LEVELS-1) */
export function windowLevelFor(lit: number): number {
  if (lit < 0.3) return 0;
  if (lit < 0.55) return 1;
  if (lit < 0.8) return 2;
  return WINDOW_LEVELS - 1;
}

/** 창 조명 단계를 바꾼다 — 텍스처만 갈아 끼우므로 셰이더는 다시 만들지 않는다 */
export function setWindowLevel(v: BuildingView, level: number): void {
  const lv = Math.max(0, Math.min(WINDOW_LEVELS - 1, level));
  if (lv === v.winLevel) return;
  v.winLevel = lv;
  const tex = v.winTex[lv];
  if (!tex) return;
  v.main.material.emissiveMap = tex;
  v.main.material.needsUpdate = false;
  if (v.upper) {
    const up = v.upper.material.emissiveMap as CanvasTexture | null;
    if (up) {
      up.image = tex.image;
      up.needsUpdate = true;
    }
  }
}
