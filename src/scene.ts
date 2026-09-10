import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  EdgesGeometry,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PCFShadowMap,
  PlaneGeometry,
  Quaternion,
  ShadowMaterial,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { CITY, OUTSKIRTS } from './constants';
import type { CityLayout, Vec2 } from './layout';
import type { Palette } from './palette';

export interface SceneParts {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: OrthographicCamera;
  /** 낮/밤 전환 때 다시 칠할 지형 재질 */
  groundMats: Record<string, MeshStandardMaterial>;
  /** 지구 색을 섞은 구획 바닥 (색을 다시 계산해야 한다) */
  plotMats: { mat: MeshStandardMaterial; hue: number }[];
  /** 낮/밤 전환 때 세기를 바꿀 조명 */
  lights: {
    hemi: HemisphereLight;
    sun: DirectionalLight;
    fill: DirectionalLight;
  };
  /** 건물 매스 컨테이너 (레이캐스트 대상) */
  cityGroup: Group;
  /** 공사 장비 컨테이너 */
  constrGroup: Group;
  /** 통행로 컨테이너 */
  routeGroup: Group;
  /** 정리 대상 */
  disposables: (BufferGeometry | Material)[];
}

export interface GapMarker {
  name: string;
  pos: Vector3;
}

function containerSize(el: HTMLElement): { w: number; h: number } {
  const r = el.getBoundingClientRect();
  return { w: Math.max(1, r.width), h: Math.max(1, r.height) };
}

export function createScene(container: HTMLElement): SceneParts {
  const { w, h } = containerSize(container);
  // 배경은 CSS 그라데이션이 담당한다. 캔버스는 투명하게 두고 도시만 그린다
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearAlpha(0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  // 배경을 비워 CSS 그라데이션이 보이게 한다. 안개도 배경색을 전제로 하므로 쓰지 않는다
  const scene = new Scene();

  const camera = new OrthographicCamera(-1, 1, 1, -1, 1, 2200);

  const hemi = new HemisphereLight(0xffffff, 0xc7ccd2, 0.85);
  scene.add(hemi);
  const sun = new DirectionalLight(0xffffff, 0.62);
  sun.position.set(-320, 520, 380);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -520;
  sc.right = 520;
  sc.top = 520;
  sc.bottom = -520;
  sc.near = 1;
  sc.far = 1600;
  sun.shadow.bias = -0.0008;
  scene.add(sun);
  const fill = new DirectionalLight(0xe6f6f7, 0.18);
  fill.position.set(200, 120, -240);
  scene.add(fill);

  const cityGroup = new Group();
  const constrGroup = new Group();
  const routeGroup = new Group();
  scene.add(cityGroup, constrGroup, routeGroup);

  return {
    renderer,
    scene,
    camera,
    groundMats: {},
    plotMats: [],
    lights: { hemi, sun, fill },
    cityGroup,
    constrGroup,
    routeGroup,
    disposables: [],
  };
}

export function resizeScene(parts: SceneParts, container: HTMLElement): void {
  const { w, h } = containerSize(container);
  parts.renderer.setSize(w, h);
}

/**
 * 지면·도로·인도·가로녹지·공원·지구 구획·가로수·빈 구획을 만든다.
 * 정적 지형이라 한 번만 부른다. 가로수 좌표를 모아 인스턴싱으로 한 번에 그린다.
 */
export function buildGround(
  parts: SceneParts,
  city: CityLayout,
  palette: Palette,
): GapMarker[] {
  const { scene, disposables } = parts;
  const mat = {
    road: new MeshStandardMaterial({ color: palette.road, roughness: 1 }),
    walk: new MeshStandardMaterial({ color: palette.walk, roughness: 1 }),
    lawn: new MeshStandardMaterial({ color: palette.lawn, roughness: 0.95 }),
    lawn2: new MeshStandardMaterial({ color: palette.lawn2, roughness: 0.95 }),
    dash: new MeshStandardMaterial({ color: palette.dash, roughness: 1 }),
    trunk: new MeshStandardMaterial({ color: palette.trunk, roughness: 0.95 }),
    leaf: new MeshStandardMaterial({ color: palette.leaf, roughness: 0.9 }),
    leaf2: new MeshStandardMaterial({ color: palette.leaf2, roughness: 0.9 }),
  };
  Object.values(mat).forEach((m) => disposables.push(m));
  parts.groundMats = mat;
  parts.plotMats = [];

  // 지면 판은 두지 않는다 — 도시가 배경 그라데이션 위에 바로 앉는다.
  // 그림자만 받는 투명한 면을 깔아 건물 그림자가 땅에 떨어지게 한다
  const shadowGeo = new PlaneGeometry(OUTSKIRTS.extX * 2, OUTSKIRTS.extZ * 2);
  const shadowMat = new ShadowMaterial({ opacity: 0.22, depthWrite: false });
  disposables.push(shadowGeo, shadowMat);
  const shadowPlane = new Mesh(shadowGeo, shadowMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.02;
  shadowPlane.receiveShadow = true;
  scene.add(shadowPlane);

  const slabGeo = new BoxGeometry(1, 1, 1);
  disposables.push(slabGeo);
  /** 두께 0.6 판. 스케일은 한 곳에만 걸어 이중 적용을 피한다 */
  const slab = (w: number, d: number, y: number, m: MeshStandardMaterial) => {
    const mesh = new Mesh(slabGeo, m);
    mesh.scale.set(w, 0.6, d);
    mesh.position.set(0, y, 0);
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };

  const treeSpots: Vec2[] = [];
  const { rx, rz, extX, extZ, roadW, blockW, blockD } = CITY;

  rx.forEach((x) => {
    const outer = Math.abs(x) > extX * 0.7;
    const w = outer ? 20 : roadW;
    slab(w, extZ * 2, 0.06, mat.road).position.x = x;
    [-1, 1].forEach((s) => {
      slab(8, extZ * 2, 0.1, mat.walk).position.x = x + s * (w / 2 + 4);
      slab(10, extZ * 2, 0.09, mat.lawn).position.x = x + s * (w / 2 + 13);
      for (let z = -extZ + 18; z < extZ - 18; z += 30) {
        if (rz.some((v) => Math.abs(z - v) < 24)) continue;
        treeSpots.push([x + s * (w / 2 + 13), z]);
      }
    });
    if (!outer) {
      for (let z = -extZ + 10; z < extZ - 10; z += 17) {
        if (rz.some((v) => Math.abs(z - v) < 20)) continue;
        const d = new Mesh(slabGeo, mat.dash);
        d.scale.set(1.4, 0.7, 7);
        d.position.set(x, 0.12, z);
        scene.add(d);
      }
    }
  });
  rz.forEach((z) => {
    const outer = Math.abs(z) > extZ * 0.7;
    const w = outer ? 20 : roadW;
    slab(extX * 2, w, 0.07, mat.road).position.z = z;
    [-1, 1].forEach((s) => {
      slab(extX * 2, 8, 0.1, mat.walk).position.z = z + s * (w / 2 + 4);
      slab(extX * 2, 10, 0.09, mat.lawn).position.z = z + s * (w / 2 + 13);
      for (let x = -extX + 18; x < extX - 18; x += 30) {
        if (rx.some((v) => Math.abs(x - v) < 24)) continue;
        treeSpots.push([x, z + s * (w / 2 + 13)]);
      }
    });
    if (!outer) {
      for (let x = -extX + 10; x < extX - 10; x += 17) {
        if (rx.some((v) => Math.abs(x - v) < 20)) continue;
        const d = new Mesh(slabGeo, mat.dash);
        d.scale.set(7, 0.7, 1.4);
        d.position.set(x, 0.12, z);
        scene.add(d);
      }
    }
  });

  // 공원 블록
  for (const [px, pz] of city.parks) {
    slab(blockW, blockD, 0.12, mat.lawn2).position.set(px, 0.12, pz);
    slab(blockW, 9, 0.16, mat.walk).position.set(px, 0.16, pz);
    slab(9, blockD, 0.16, mat.walk).position.set(px, 0.16, pz);
    for (let i = 0; i < 18; i++) {
      const q = i % 3;
      const r = Math.floor(i / 3);
      const jx = px + (q - 1) * (blockW / 2 - 34) + (Math.random() - 0.5) * 22;
      const jz =
        pz + (r / 5 - 0.5) * (blockD - 40) + (Math.random() - 0.5) * 16;
      // 산책로는 비워 둔다
      if (Math.abs(jx - px) < 11 || Math.abs(jz - pz) < 11) continue;
      treeSpots.push([jx, jz]);
    }
  }

  // 지구 구획
  const pw = blockW - 24;
  const pd = blockD - 24;
  const plotEdgeGeo = new EdgesGeometry(new PlaneGeometry(pw, pd));
  disposables.push(plotEdgeGeo);
  const plotEdgeMat = new LineBasicMaterial({ color: palette.plotEdge });
  disposables.push(plotEdgeMat);
  for (const d of city.districts) {
    // 블록 전체를 보도 색으로 먼저 덮어 배경이 비치는 틈을 없앤다
    slab(blockW, blockD, 0.11, mat.walk).position.set(d.at[0], 0.11, d.at[1]);
    // 구획 바닥을 지구 색으로 옅게 물들여 회색 사각형으로 보이지 않게 한다
    const plotMat = new MeshStandardMaterial({
      color: palette.plot.clone().lerp(new Color(d.hue), 0.16),
      roughness: 1,
    });
    disposables.push(plotMat);
    parts.plotMats.push({ mat: plotMat, hue: d.hue });
    slab(pw, pd, 0.13, plotMat).position.set(d.at[0], 0.13, d.at[1]);
    const e = new LineSegments(plotEdgeGeo, plotEdgeMat);
    e.rotation.x = -Math.PI / 2;
    e.position.set(d.at[0], 0.2, d.at[1]);
    scene.add(e);
    for (const oz of [-pd / 2 + 6, pd / 2 - 6]) {
      slab(pw, 7, 0.17, mat.lawn).position.set(d.at[0], 0.17, d.at[1] + oz);
    }
    for (let x = -pw / 2 + 14; x < pw / 2 - 10; x += 26) {
      treeSpots.push([d.at[0] + x, d.at[1] - pd / 2 + 6]);
      treeSpots.push([d.at[0] + x, d.at[1] + pd / 2 - 6]);
    }
  }

  // 빈 구획 — 잔디 + 점선 테두리
  const gaps: GapMarker[] = [];
  const gapEdgeGeo = new EdgesGeometry(
    new PlaneGeometry(CITY.footW, CITY.footD),
  );
  disposables.push(gapEdgeGeo);
  const gapEdgeMat = new LineDashedMaterial({
    color: palette.gapEdge,
    dashSize: 5,
    gapSize: 4,
  });
  disposables.push(gapEdgeMat);
  for (const d of city.districts) {
    for (const g of d.gaps) {
      slab(CITY.footW, CITY.footD, 0.19, mat.lawn).position.set(
        g.at[0],
        0.19,
        g.at[1],
      );
      const m = new LineSegments(gapEdgeGeo, gapEdgeMat);
      m.computeLineDistances();
      m.rotation.x = -Math.PI / 2;
      m.position.set(g.at[0], 0.26, g.at[1]);
      scene.add(m);
      gaps.push({ name: g.name, pos: new Vector3(g.at[0], 0, g.at[1]) });
    }
  }

  // 가로수 — 인스턴싱
  if (treeSpots.length) {
    const trunkGeo = new CylinderGeometry(0.55, 0.75, 7, 6);
    const leafGeo = new IcosahedronGeometry(1, 0);
    const coneGeo = new ConeGeometry(1, 2, 7);
    disposables.push(trunkGeo, leafGeo, coneGeo);
    const n = treeSpots.length;
    const trunks = new InstancedMesh(trunkGeo, mat.trunk, n);
    const leaves = new InstancedMesh(leafGeo, mat.leaf, n);
    const cones = new InstancedMesh(coneGeo, mat.leaf2, n);
    trunks.castShadow = leaves.castShadow = cones.castShadow = true;
    leaves.receiveShadow = true;
    const M = new Matrix4();
    const Q = new Quaternion();
    const P = new Vector3();
    const S = new Vector3();
    const axis = new Vector3(0, 1, 0);
    treeSpots.forEach(([x, z], i) => {
      const s = 0.85 + Math.random() * 0.5;
      Q.setFromAxisAngle(axis, Math.random() * Math.PI);
      P.set(x, 3.5 * s, z);
      S.set(s, s, s);
      M.compose(P, Q, S);
      trunks.setMatrixAt(i, M);
      const isCone = i % 4 === 0;
      P.set(x, 7 * s + (isCone ? 4.6 : 3.4) * s, z);
      S.set(
        isCone ? 3.2 * s : 4.4 * s,
        isCone ? 6.4 * s : 5.2 * s,
        isCone ? 3.2 * s : 4.4 * s,
      );
      M.compose(P, Q, S);
      if (isCone) {
        cones.setMatrixAt(i, M);
        M.compose(P.set(0, -9999, 0), Q, S);
        leaves.setMatrixAt(i, M);
      } else {
        leaves.setMatrixAt(i, M);
        M.compose(P.set(0, -9999, 0), Q, S);
        cones.setMatrixAt(i, M);
      }
    });
    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    cones.instanceMatrix.needsUpdate = true;
    scene.add(trunks, leaves, cones);
  }

  return gaps;
}

/**
 * 팔레트를 다시 입힌다 (낮 ↔ 밤).
 * 지형 재질은 만들 때 색을 복사하므로 여기서 직접 갱신하고, 조명 세기도 함께 바꾼다.
 */
export function applyPalette(
  parts: SceneParts,
  palette: Palette,
  night: boolean,
): void {
  const m = parts.groundMats;
  const set = (key: string, c: Color) => m[key]?.color.copy(c);
  set('road', palette.road);
  set('walk', palette.walk);
  set('lawn', palette.lawn);
  set('lawn2', palette.lawn2);
  set('dash', palette.dash);
  set('trunk', palette.trunk);
  set('leaf', palette.leaf);
  set('leaf2', palette.leaf2);
  set('filler', palette.pale);
  set('lot', palette.walk);
  set('water', palette.water);
  for (const { mat, hue } of parts.plotMats)
    mat.color.copy(palette.plot).lerp(new Color(hue), 0.16);
  const { hemi, sun, fill } = parts.lights;
  hemi.intensity = night ? 0.3 : 0.85;
  hemi.groundColor.set(night ? 0x2b3450 : 0xc7ccd2);
  sun.intensity = night ? 0.16 : 0.62;
  fill.intensity = night ? 0.1 : 0.18;
}

export function disposeScene(parts: SceneParts): void {
  parts.scene.traverse((o) => {
    const m = o as Partial<Mesh>;
    const geo = m.geometry;
    if (geo) geo.dispose();
    const mm = m.material;
    if (Array.isArray(mm)) mm.forEach((x) => x.dispose());
    else mm?.dispose();
  });
  parts.disposables.forEach((d) => d.dispose());
  parts.renderer.dispose();
  parts.renderer.domElement.remove();
}
