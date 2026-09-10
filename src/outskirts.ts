import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { CITY, OUTSKIRTS } from './constants';
import type { SceneParts } from './scene';
import type { Palette } from './palette';

/** 차가 달리는 차선 — 시작점과 끝점 (지면 좌표) */
export interface Lane {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** 좌표에서 정해지는 의사 난수 — 다시 그려도 같은 외곽이 나오게 */
function hash(x: number, z: number, salt = 0): number {
  const s = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * 도시 바깥을 채운다. 도로를 화면 끝까지 잇고, 남는 칸에 채움 건물·공원·주차장·연못을 놓고,
 * +z 끝을 따라 강을 흘린다. 항목과는 무관한 배경이라 색은 옅게 두고 클릭 대상에도 넣지 않는다.
 * 돌려주는 차선 목록으로 차량이 달린다.
 */
export function buildOutskirts(parts: SceneParts, palette: Palette): Lane[] {
  const { scene, disposables } = parts;
  const O = OUTSKIRTS;
  const mat = {
    filler: new MeshStandardMaterial({ color: palette.pale, roughness: 0.85 }),
    road:
      parts.groundMats.road ??
      new MeshStandardMaterial({ color: palette.road }),
    lawn2:
      parts.groundMats.lawn2 ??
      new MeshStandardMaterial({ color: palette.lawn2 }),
    lot: new MeshStandardMaterial({ color: palette.walk, roughness: 1 }),
    water: new MeshStandardMaterial({
      color: palette.water,
      roughness: 0.25,
      metalness: 0.1,
    }),
    dash:
      parts.groundMats.dash ??
      new MeshStandardMaterial({ color: palette.dash }),
  };
  disposables.push(mat.filler, mat.lot, mat.water);
  parts.groundMats.filler = mat.filler;
  parts.groundMats.lot = mat.lot;
  parts.groundMats.water = mat.water;

  const box = new BoxGeometry(1, 1, 1);
  disposables.push(box);
  const slab = (
    w: number,
    d: number,
    y: number,
    m: MeshStandardMaterial,
    x: number,
    z: number,
    h = 0.6,
  ) => {
    const mesh = new Mesh(box, m);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };

  // ── 도로: 안쪽 도로를 바깥까지 잇고 바깥 도로를 더 깐다 (안쪽 도로 폭과 겹치는 구간은 안쪽이 위에 있다)
  const lanes: Lane[] = [];
  const xRoads = [...CITY.rx, ...O.rx];
  const zRoads = [...CITY.rz, ...O.rz];
  for (const x of xRoads) {
    slab(O.roadW, O.extZ * 2, 0.04, mat.road, x, 0);
    for (let z = -O.extZ + 12; z < O.extZ - 12; z += 22) {
      if (Math.abs(z) < CITY.extZ && Math.abs(x) < CITY.extX) continue;
      slab(1.2, 6, 0.08, mat.dash, x, z, 0.5);
    }
    const off = Math.abs(x) < CITY.extX ? 5 : 3.5;
    lanes.push({ x0: x + off, z0: -O.extZ, x1: x + off, z1: O.extZ });
    lanes.push({ x0: x - off, z0: O.extZ, x1: x - off, z1: -O.extZ });
  }
  for (const z of zRoads) {
    slab(O.extX * 2, O.roadW, 0.05, mat.road, 0, z);
    for (let x = -O.extX + 12; x < O.extX - 12; x += 22) {
      if (Math.abs(z) < CITY.extZ && Math.abs(x) < CITY.extX) continue;
      slab(6, 1.2, 0.08, mat.dash, x, z, 0.5);
    }
    const off = Math.abs(z) < CITY.extZ ? 5 : 3.5;
    lanes.push({ x0: -O.extX, z0: z + off, x1: O.extX, z1: z + off });
    lanes.push({ x0: O.extX, z0: z - off, x1: -O.extX, z1: z - off });
  }

  // ── 칸 채우기
  const trees: [number, number][] = [];
  const fillerBoxes: {
    x: number;
    z: number;
    w: number;
    h: number;
    d: number;
  }[] = [];
  for (const cx of O.cx) {
    for (const cz of O.cz) {
      const inner = Math.abs(cx) < CITY.extX && Math.abs(cz) < CITY.extZ;
      if (inner) continue;
      // 강과 겹치는 칸은 비운다
      if (cz + O.cellD / 2 > O.riverZ - O.riverW / 2) continue;
      const r = hash(cx, cz);
      const w = O.cellW - 24;
      const d = O.cellD - 24;
      // 칸 전체를 보도 색으로 먼저 덮어 도로와 사이에 배경이 비치지 않게 한다
      slab(O.cellW + 10, O.cellD + 10, 0.02, mat.lot, cx, cz, 0.4);
      // 도심에서 멀수록 낮고 성글게
      const dist = Math.hypot(cx / O.extX, cz / O.extZ);
      if (r < 0.52) {
        slab(w, d, 0.1, mat.lot, cx, cz);
        const n = 2 + Math.floor(hash(cx, cz, 1) * 3);
        for (let i = 0; i < n; i++) {
          const fx = cx + (hash(cx, cz, 10 + i) - 0.5) * (w - 50);
          const fz = cz + (hash(cx, cz, 20 + i) - 0.5) * (d - 40);
          const h = (6 + hash(cx, cz, 30 + i) * 22) * (1.15 - dist * 0.6);
          fillerBoxes.push({
            x: fx,
            z: fz,
            w: 22 + hash(cx, cz, 40 + i) * 18,
            h: Math.max(4, h),
            d: 18 + hash(cx, cz, 50 + i) * 16,
          });
        }
      } else if (r < 0.78) {
        slab(w, d, 0.1, mat.lawn2, cx, cz);
        for (let i = 0; i < 9; i++)
          trees.push([
            cx + (hash(cx, cz, 60 + i) - 0.5) * (w - 20),
            cz + (hash(cx, cz, 70 + i) - 0.5) * (d - 20),
          ]);
      } else if (r < 0.9) {
        // 주차장 — 흰 줄
        slab(w, d, 0.1, mat.lot, cx, cz);
        for (let i = -3; i <= 3; i++)
          slab(1, d - 30, 0.14, mat.dash, cx + i * 14, cz, 0.4);
      } else {
        slab(w, d, 0.1, mat.lawn2, cx, cz);
        slab(w * 0.55, d * 0.5, 0.13, mat.water, cx, cz, 0.5);
        for (let i = 0; i < 5; i++)
          trees.push([
            cx + (hash(cx, cz, 80 + i) - 0.5) * (w - 20),
            cz + (hash(cx, cz, 90 + i) > 0.5 ? 1 : -1) * (d / 2 - 12),
          ]);
      }
    }
  }
  // 강
  slab(O.extX * 2 + 200, O.riverW, 0.03, mat.water, 0, O.riverZ, 0.5);

  // 채움 건물 — 인스턴싱 한 번
  if (fillerBoxes.length) {
    const im = new InstancedMesh(box, mat.filler, fillerBoxes.length);
    im.castShadow = true;
    im.receiveShadow = true;
    const M = new Matrix4();
    const Q = new Quaternion();
    fillerBoxes.forEach((b, i) => {
      M.compose(
        new Vector3(b.x, b.h / 2 + 0.4, b.z),
        Q,
        new Vector3(b.w, b.h, b.d),
      );
      im.setMatrixAt(i, M);
    });
    im.instanceMatrix.needsUpdate = true;
    scene.add(im);
  }

  // 외곽 나무 — 도심 가로수와 같은 모양
  if (trees.length) {
    const trunkGeo = new CylinderGeometry(0.55, 0.75, 7, 6);
    const leafGeo = new IcosahedronGeometry(1, 0);
    const coneGeo = new ConeGeometry(1, 2, 7);
    disposables.push(trunkGeo, leafGeo, coneGeo);
    const trunkMat =
      parts.groundMats.trunk ??
      new MeshStandardMaterial({ color: palette.trunk });
    const leafMat =
      parts.groundMats.leaf ??
      new MeshStandardMaterial({ color: palette.leaf });
    const leaf2Mat =
      parts.groundMats.leaf2 ??
      new MeshStandardMaterial({ color: palette.leaf2 });
    const n = trees.length;
    const trunks = new InstancedMesh(trunkGeo, trunkMat, n);
    const leaves = new InstancedMesh(leafGeo, leafMat, n);
    const cones = new InstancedMesh(coneGeo, leaf2Mat, n);
    trunks.castShadow = leaves.castShadow = cones.castShadow = true;
    const M = new Matrix4();
    const Q = new Quaternion();
    const P = new Vector3();
    const S = new Vector3();
    const axis = new Vector3(0, 1, 0);
    trees.forEach(([x, z], i) => {
      const s = 0.85 + hash(x, z, 3) * 0.5;
      Q.setFromAxisAngle(axis, hash(x, z, 4) * Math.PI);
      M.compose(P.set(x, 3.5 * s, z), Q, S.set(s, s, s));
      trunks.setMatrixAt(i, M);
      const isCone = i % 4 === 0;
      P.set(x, 7 * s + (isCone ? 4.6 : 3.4) * s, z);
      S.set(
        isCone ? 3.2 * s : 4.4 * s,
        isCone ? 6.4 * s : 5.2 * s,
        isCone ? 3.2 * s : 4.4 * s,
      );
      M.compose(P, Q, S);
      (isCone ? cones : leaves).setMatrixAt(i, M);
      M.compose(P.set(0, -9999, 0), Q, S);
      (isCone ? leaves : cones).setMatrixAt(i, M);
    });
    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    cones.instanceMatrix.needsUpdate = true;
    scene.add(trunks, leaves, cones);
  }

  return lanes;
}
