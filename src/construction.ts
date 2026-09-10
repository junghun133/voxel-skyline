import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import type { CityLayout } from './layout';
import { CITY } from './constants';
import type { BuildingView } from './buildings';
import type { Palette } from './palette';

interface Truck {
  group: Group;
  axis: 'x' | 'z';
  dir: number;
  speed: number;
}
interface Digger {
  group: Group;
  turn: Group;
  boom: Group;
  arm: Group;
  bucket: Mesh;
  phase: number;
}
interface Crane {
  group: Group;
  mast: Mesh;
  head: Group;
  slew: Group;
  trolley: Group;
  cable: Mesh;
  hook: Mesh;
  phase: number;
  targetH: number;
}

export interface ConstructionSite {
  trucks: Truck[];
  diggers: Digger[];
  cranes: Crane[];
  disposables: (BufferGeometry | Material)[];
}

/** 공사 장비 — 학습(건설) 중에만 등장한다 */
export function buildConstruction(
  constrGroup: Group,
  city: CityLayout,
  buildings: BuildingView[],
  palette: Palette,
): ConstructionSite {
  const boxGeo = new BoxGeometry(1, 1, 1);
  const wheelGeo = new CylinderGeometry(1.7, 1.7, 1.4, 12);
  const coneGeo = new ConeGeometry(1.5, 4.2, 10);
  const disposables: (BufferGeometry | Material)[] = [
    boxGeo,
    wheelGeo,
    coneGeo,
  ];

  const mat = {
    yellow: new MeshStandardMaterial({
      color: palette.eqYellow,
      roughness: 0.6,
      metalness: 0.1,
    }),
    yellowD: new MeshStandardMaterial({
      color: palette.eqYellowDark,
      roughness: 0.6,
    }),
    orange: new MeshStandardMaterial({
      color: palette.eqOrange,
      roughness: 0.6,
      metalness: 0.1,
    }),
    dark: new MeshStandardMaterial({ color: palette.eqDark, roughness: 0.8 }),
    steel: new MeshStandardMaterial({
      color: palette.eqSteel,
      roughness: 0.5,
      metalness: 0.3,
    }),
    sign: new MeshStandardMaterial({ color: palette.eqSign, roughness: 0.7 }),
    red: new MeshStandardMaterial({ color: palette.eqRed, roughness: 0.75 }),
    white: new MeshStandardMaterial({ color: palette.eqWhite, roughness: 0.8 }),
  };
  Object.values(mat).forEach((m) => disposables.push(m));

  /** 스케일은 메시 하나에만 건다 (그룹과 이중 적용하면 제곱이 된다) */
  const box = (
    w: number,
    h: number,
    d: number,
    m: MeshStandardMaterial,
    x: number,
    y: number,
    z: number,
    parent: Group,
  ): Mesh => {
    const mesh = new Mesh(boxGeo, m);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const wheels = (g: Group, xs: number[], z: number) => {
    for (const x of xs) {
      for (const s of [-1, 1]) {
        const w = new Mesh(wheelGeo, mat.dark);
        w.rotation.z = Math.PI / 2;
        w.position.set(x, 1.7, s * z);
        w.castShadow = true;
        g.add(w);
      }
    }
  };

  const dumpTruck = (): Group => {
    const g = new Group();
    box(13, 3, 6.8, mat.dark, 0, 3.5, 0, g);
    box(4.8, 4.8, 6.6, mat.yellow, 4.5, 6.9, 0, g);
    box(1.8, 2.1, 5.4, mat.steel, 6.6, 8.1, 0, g);
    box(8.1, 3.9, 6.6, mat.yellowD, -2.4, 7.1, 0, g);
    box(7.8, 0.8, 6, mat.dark, -2.4, 9, 0, g);
    box(1, 1, 7.2, mat.red, -6.6, 4.6, 0, g);
    wheels(g, [4.8, -0.9, -4.5], 3.3);
    constrGroup.add(g);
    return g;
  };

  const excavator = (): Digger => {
    const g = new Group();
    box(11.1, 2.4, 7.5, mat.dark, 0, 1.4, 0, g);
    for (const s of [-1, 1]) box(11.4, 1.2, 1, mat.steel, 0, 2.6, s * 3.4, g);
    const turn = new Group();
    turn.position.y = 2.6;
    g.add(turn);
    box(7.8, 4.5, 6.3, mat.orange, -0.6, 2.4, 0, turn);
    box(3.6, 3.6, 5.1, mat.steel, 2.4, 3.6, 0, turn);
    box(2, 0.8, 5.6, mat.yellow, -4.2, 4.4, 0, turn);
    const boom = new Group();
    boom.position.set(3.3, 3.3, 0);
    turn.add(boom);
    box(10.5, 1.7, 1.7, mat.orange, 5.2, 0, 0, boom);
    const arm = new Group();
    arm.position.set(10.5, 0, 0);
    boom.add(arm);
    box(8.1, 1.4, 1.4, mat.orange, 4, 0, 0, arm);
    const bucket = box(2.7, 2.7, 3.3, mat.steel, 8.4, -0.9, 0, arm);
    constrGroup.add(g);
    return { group: g, turn, boom, arm, bucket, phase: 0 };
  };

  const sign = (x: number, z: number, rot: number, kind: number) => {
    const g = new Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    box(0.9, 9, 0.9, mat.steel, 0, 4.5, 0, g);
    if (kind === 1) {
      box(7.6, 5.4, 0.5, mat.sign, 0, 10.2, 0, g);
      box(6, 0.8, 0.6, mat.dark, 0, 11.2, 0.15, g);
      box(6, 0.8, 0.6, mat.dark, 0, 9.2, 0.15, g);
    } else if (kind === 2) {
      for (let i = 0; i < 4; i++) {
        box(
          1.9,
          5.2,
          0.5,
          i % 2 ? mat.white : mat.red,
          (i - 1.5) * 1.95,
          10.2,
          0,
          g,
        );
      }
    } else {
      box(8.6, 5.2, 0.55, mat.sign, 0, 10.4, 0, g);
      box(7, 0.9, 0.65, mat.dark, 0, 11.4, 0.18, g);
      box(4.4, 0.7, 0.65, mat.dark, -1.2, 9.6, 0.18, g);
    }
    box(4.4, 0.8, 4.4, mat.dark, 0, 0.4, 0, g);
    constrGroup.add(g);
  };

  const barrier = (x: number, z: number, rot: number) => {
    const g = new Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    for (let i = 0; i < 6; i++) {
      box(3.3, 2.6, 1, i % 2 ? mat.white : mat.red, (i - 2.5) * 3.4, 2.7, 0, g);
    }
    box(21, 0.7, 1.1, mat.steel, 0, 0.9, 0, g);
    for (const s of [-1, 1]) box(1, 4.2, 3, mat.steel, s * 9.8, 2.1, 0, g);
    constrGroup.add(g);
  };

  const trafficCone = (x: number, z: number) => {
    const g = new Group();
    g.position.set(x, 0, z);
    const c = new Mesh(coneGeo, mat.red);
    c.position.y = 2.1;
    c.castShadow = true;
    g.add(c);
    box(3.4, 0.5, 3.4, mat.dark, 0, 0.25, 0, g);
    constrGroup.add(g);
  };

  const towerCrane = (): Crane => {
    const g = new Group();
    box(5, 1, 5, mat.dark, 0, 0.5, 0, g);
    const mastGroup = new Group();
    g.add(mastGroup);
    // 단위 높이 1 → scale.y 로만 확장한다
    const mast = box(1.8, 1, 1.8, mat.yellow, 0, 0.5, 0, mastGroup);
    const head = new Group();
    g.add(head);
    box(2.2, 3.4, 2.2, mat.yellowD, 0, 1.7, 0, head);
    const slew = new Group();
    slew.position.y = 3.4;
    head.add(slew);
    box(2.2, 1.6, 2.2, mat.steel, 0, 0.8, 0, slew);
    box(34, 1.3, 1.6, mat.yellow, 14, 1.6, 0, slew);
    box(12, 1.1, 1.4, mat.yellowD, -6, 1.6, 0, slew);
    box(4, 2.6, 3, mat.dark, -10.5, 1.9, 0, slew);
    box(1, 7, 1, mat.steel, 0, 5.4, 0, slew);
    const trolley = new Group();
    slew.add(trolley);
    box(2.4, 0.9, 1.8, mat.steel, 0, 1, 0, trolley);
    const cable = box(0.35, 1, 0.35, mat.dark, 0, 0, 0, trolley);
    const hook = box(2, 1.6, 2, mat.orange, 0, 0, 0, trolley);
    constrGroup.add(g);
    return {
      group: g,
      mast,
      head,
      slew,
      trolley,
      cable,
      hook,
      phase: 0,
      targetH: 42,
    };
  };

  // 트럭 — 간선도로를 순환
  const trucks: Truck[] = [];
  [CITY.rx[0], CITY.rx[1]].forEach((x, i) => {
    for (const s of [-1, 1]) {
      const g = dumpTruck();
      g.position.set(x + s * 9, 0, (i ? 90 : -90) * s);
      g.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
      trucks.push({ group: g, axis: 'z', dir: s, speed: 26 + i * 7 });
    }
  });
  [CITY.rz[0], CITY.rz[1]].forEach((z, i) => {
    for (const s of [-1, 1]) {
      const g = dumpTruck();
      g.position.set((i ? 110 : -110) * s, 0, z + s * 9);
      g.rotation.y = s > 0 ? Math.PI : 0;
      trucks.push({ group: g, axis: 'x', dir: -s, speed: 30 + i * 6 });
    }
  });

  // 지구마다 굴착기 1대 + 표지판 3종 + 바리케이드 + 라바콘
  const diggers: Digger[] = [];
  city.districts.forEach((d, i) => {
    const e = excavator();
    e.group.position.set(
      d.at[0] - (CITY.blockW / 2 - 36),
      0,
      d.at[1] + (i < 2 ? -1 : 1) * (CITY.blockD / 2 - 28),
    );
    e.group.rotation.y = i % 2 ? 0.6 : -2.2;
    e.phase = i * 1.1;
    diggers.push(e);
    sign(
      d.at[0] - CITY.blockW / 2 + 18,
      d.at[1] - CITY.blockD / 2 + 12,
      0.5,
      0,
    );
    sign(
      d.at[0] + CITY.blockW / 2 - 18,
      d.at[1] - CITY.blockD / 2 + 12,
      -0.5,
      1,
    );
    sign(d.at[0], d.at[1] + CITY.blockD / 2 - 10, Math.PI, 2);
    barrier(d.at[0] + CITY.blockW / 2 - 34, d.at[1] - CITY.blockD / 2 + 10, 0);
    barrier(d.at[0] - CITY.blockW / 2 + 38, d.at[1] + CITY.blockD / 2 - 10, 0);
    barrier(d.at[0] - CITY.blockW / 2 + 10, d.at[1], Math.PI / 2);
    for (let c = 0; c < 8; c++) {
      trafficCone(
        d.at[0] - CITY.blockW / 2 + 22 + c * 20,
        d.at[1] - CITY.blockD / 2 + 3,
      );
    }
  });

  // 건물마다 타워크레인 1기
  const cranes: Crane[] = buildings.map((v, i) => {
    const c = towerCrane();
    const side = i % 2 ? 1 : -1;
    const front = i % 3 === 0 ? 1 : -1;
    c.group.position.set(
      v.data.at[0] + side * (v.data.bw * 0.62 + 9),
      0,
      v.data.at[1] + front * (v.data.bd * 0.55 + 7),
    );
    c.group.rotation.y = side > 0 ? -0.35 : 2.85;
    c.phase = i * 0.9;
    c.targetH = Math.max(v.totalH + 16, 42);
    return c;
  });

  // 공원·교차로 주변 표지판
  city.parks.forEach(([px, pz], i) => {
    sign(px, pz - CITY.blockD / 2 + 14, -0.4, i % 3);
    sign(px + CITY.blockW / 2 - 16, pz, Math.PI / 2, (i + 1) % 3);
  });
  const crossings: [number, number][] = [
    [CITY.rx[0], CITY.rz[0]],
    [CITY.rx[1], CITY.rz[0]],
    [CITY.rx[0], CITY.rz[1]],
    [CITY.rx[1], CITY.rz[1]],
  ];
  crossings.forEach(([x, z], i) => {
    sign(x + 22, z + 22, -0.8, i % 3);
    trafficCone(x + 14, z + 14);
    trafficCone(x - 14, z + 14);
    trafficCone(x + 14, z - 14);
    trafficCone(x - 14, z - 14);
  });

  return { trucks, diggers, cranes, disposables };
}

/** 건설 중 장비 애니메이션 */
export function animateConstruction(site: ConstructionSite, t: number): void {
  for (const c of site.cranes) {
    const h = c.targetH;
    c.mast.scale.y = h;
    c.mast.position.y = h / 2;
    c.head.position.y = h;
    c.slew.rotation.y = Math.sin(t * 0.55 + c.phase) * 1.5;
    c.trolley.position.x = 9 + ((Math.sin(t * 0.8 + c.phase) + 1) / 2) * 20;
    const drop = 6 + ((Math.sin(t * 1.1 + c.phase + 1.4) + 1) / 2) * (h * 0.55);
    c.cable.scale.y = drop;
    c.cable.position.y = 1 - drop / 2;
    c.hook.position.y = 1 - drop;
  }
  for (const T of site.trucks) {
    const lim = (T.axis === 'z' ? CITY.extZ : CITY.extX) - 22;
    if (T.axis === 'z') {
      T.group.position.z += (T.dir * T.speed) / 60;
      if (T.group.position.z > lim) T.group.position.z = -lim;
      if (T.group.position.z < -lim) T.group.position.z = lim;
    } else {
      T.group.position.x += (T.dir * T.speed) / 60;
      if (T.group.position.x > lim) T.group.position.x = -lim;
      if (T.group.position.x < -lim) T.group.position.x = lim;
    }
    T.group.position.y = Math.abs(Math.sin(t * 9 + T.speed)) * 0.16;
  }
  for (const d of site.diggers) {
    d.turn.rotation.y = Math.sin(t * 1.3 + d.phase) * 0.85;
    d.boom.rotation.z = -0.3 + Math.sin(t * 1.9 + d.phase) * 0.34;
    d.arm.rotation.z = 0.72 + Math.sin(t * 1.9 + d.phase + 1.1) * 0.46;
    d.bucket.rotation.z = Math.sin(t * 1.9 + d.phase + 2) * 0.65;
  }
}
