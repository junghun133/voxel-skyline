import {
  BufferGeometry,
  Color,
  InstancedMesh,
  Material,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Scene,
  SphereGeometry,
  Vector3,
} from 'three';
import type { BuildingView } from './buildings';

/** 건물 하나에 붙는 빛 알갱이 수 */
const MOTES_PER = 3;
/** 한 알갱이가 바닥에서 꼭대기까지 오르는 시간(초) — 아주 느리게 */
const RISE_SEC = 9;
/** 최근 저장으로 활기가 도는 시간(초) */
const BURST_SEC = 6;

interface Mote {
  /** 0~1 진행도 (바닥 → 꼭대기) */
  p: number;
  /** 건물 둘레 위 각도 */
  angle: number;
  /** 둘레 반지름 비율 */
  r: number;
  /** 진행 속도 배율 */
  k: number;
}

interface BuildingState {
  lit: number;
  active: boolean;
  burstUntil: number;
}

/**
 * 건물 주변을 천천히 떠오르는 작은 빛 — "지금도 이 안에서 항목이 쓰이고 있다"는 표시.
 * 활성도가 높을수록 알갱이가 많고, 항목이 저장되면 잠깐 더 활기를 띤다.
 * 한 InstancedMesh 로 그려 건물 수 × 3 개까지만 다룬다.
 */
export interface Ambient {
  /** 매 프레임 건물 상태를 알려 준다 (활성도·선택/질의 대상 여부) */
  setState(index: number, lit: number, active: boolean): void;
  /** 저장 직후 — 잠깐 알갱이를 늘리고 빨라진다 */
  burst(index: number, now: number): void;
  update(t: number, night: boolean): void;
}

export function createAmbient(
  scene: Scene,
  views: BuildingView[],
  disposables: (BufferGeometry | Material)[],
): Ambient {
  const n = views.length * MOTES_PER;
  const geo = new SphereGeometry(1, 8, 6);
  const mat = new MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  disposables.push(geo, mat);
  const mesh = new InstancedMesh(geo, mat, Math.max(1, n));
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  scene.add(mesh);

  const motes: Mote[] = [];
  const states: BuildingState[] = views.map(() => ({
    lit: 0,
    active: false,
    burstUntil: 0,
  }));
  const white = new Color(0xffffff);
  views.forEach((v, i) => {
    for (let j = 0; j < MOTES_PER; j++) {
      motes.push({
        p: (j / MOTES_PER + i * 0.137) % 1,
        angle: (j / MOTES_PER) * Math.PI * 2 + i * 0.7,
        r: 0.58 + j * 0.08,
        k: 0.85 + ((i * 3 + j) % 4) * 0.1,
      });
      mesh.setColorAt(i * MOTES_PER + j, v.accent.clone().lerp(white, 0.35));
    }
  });
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  const M = new Matrix4();
  const Q = new Quaternion();
  const P = new Vector3();
  const S = new Vector3();
  let last = -1;

  return {
    setState(index, lit, active) {
      const s = states[index];
      if (!s) return;
      s.lit = lit;
      s.active = active;
    },
    burst(index, now) {
      const s = states[index];
      if (s) s.burstUntil = now + BURST_SEC;
    },
    update(t, night) {
      const dt = last < 0 ? 0 : Math.min(0.25, Math.max(0, t - last));
      last = t;
      mat.opacity = night ? 0.78 : 0.5;
      views.forEach((v, i) => {
        const s = states[i]!;
        const bursting = t < s.burstUntil;
        // 보이는 알갱이 수 — 활성도 45% 아래면 없음, 선택·질의 대상이거나 저장 직후면 전부
        const visible =
          s.active || bursting
            ? MOTES_PER
            : s.lit < 0.45
              ? 0
              : Math.round(s.lit * MOTES_PER);
        const u = Math.min(v.data.bw, v.data.bd) * 0.07;
        const radius = Math.max(v.data.bw, v.data.bd) * 0.62;
        const top = v.totalH * v.group.scale.y + u * 1.5;
        for (let j = 0; j < MOTES_PER; j++) {
          const m = motes[i * MOTES_PER + j]!;
          const idx = i * MOTES_PER + j;
          if (j >= visible) {
            M.compose(P.set(0, -9999, 0), Q, S.set(0.001, 0.001, 0.001));
            mesh.setMatrixAt(idx, M);
            continue;
          }
          m.p += (dt / RISE_SEC) * m.k * (bursting ? 1.8 : 1);
          if (m.p > 1) m.p -= 1;
          const a = m.angle + t * 0.12;
          const rr = radius * m.r;
          P.set(
            v.data.at[0] + Math.cos(a) * rr,
            1 + m.p * top,
            v.data.at[1] + Math.sin(a) * rr,
          );
          // 나타나고 사라질 때는 크기로 스며들게 한다
          const size = u * 0.34 * Math.sin(Math.PI * m.p) + 0.001;
          M.compose(P, Q, S.set(size, size, size));
          mesh.setMatrixAt(idx, M);
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
