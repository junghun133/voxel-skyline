import {
  BoxGeometry,
  BufferGeometry,
  Color,
  InstancedMesh,
  Material,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Scene,
  Vector3,
} from 'three';
import type { Lane } from './outskirts';

interface Car {
  lane: number;
  /** 차선 위 진행도 0~1 */
  t: number;
  /** 초당 진행도 */
  speed: number;
}

/** 도로를 계속 오가는 차량. 한 InstancedMesh 로 그리고 프레임마다 위치만 갱신한다 */
export interface Traffic {
  update(dt: number, night: boolean): void;
}

const CAR_COLORS = [
  0xf2f4f6, 0xd7dce2, 0x8a929c, 0xd9544b, 0x3f6ae0, 0xe9b23c, 0x2c3752,
];

/** 차선 길이(월드)를 초당 속도 18~32 로 지나가도록 진행도 속도를 정한다 */
function laneLength(l: Lane): number {
  return Math.hypot(l.x1 - l.x0, l.z1 - l.z0);
}

export function createTraffic(
  scene: Scene,
  lanes: Lane[],
  count: number,
  disposables: (BufferGeometry | Material)[],
): Traffic {
  const geo = new BoxGeometry(3, 1.9, 6);
  // 밤에는 약하게 빛나 도로 위 움직임이 보이게 한다
  const mat = new MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.4,
    metalness: 0.2,
    emissive: new Color(0xfff2c8),
    emissiveIntensity: 0,
  });
  disposables.push(geo, mat);
  const mesh = new InstancedMesh(geo, mat, count);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);

  const cars: Car[] = [];
  for (let i = 0; i < count; i++) {
    const lane = lanes.length ? i % lanes.length : 0;
    const len = Math.max(
      1,
      laneLength(lanes[lane] ?? { x0: 0, z0: 0, x1: 1, z1: 0 }),
    );
    cars.push({
      lane,
      t: (((i * 0.618) % 1) + Math.random() * 0.1) % 1,
      speed: (18 + Math.random() * 14) / len,
    });
    mesh.setColorAt(
      i,
      new Color(CAR_COLORS[i % CAR_COLORS.length] ?? 0xffffff),
    );
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  const M = new Matrix4();
  const Q = new Quaternion();
  const P = new Vector3();
  const S = new Vector3(1, 1, 1);
  const up = new Vector3(0, 1, 0);

  return {
    update(dt, night) {
      mat.emissiveIntensity = night ? 0.45 : 0;
      cars.forEach((c, i) => {
        const l = lanes[c.lane];
        if (!l) return;
        c.t += c.speed * dt;
        // 끝에 닿으면 반대편에서 다시 나온다. 잠깐 사라졌다 나오게 뒤로 조금 돌린다
        if (c.t > 1) c.t -= 1 + Math.random() * 0.15;
        const t = Math.max(0, c.t);
        P.set(l.x0 + (l.x1 - l.x0) * t, 1.2, l.z0 + (l.z1 - l.z0) * t);
        Q.setFromAxisAngle(up, Math.atan2(l.x1 - l.x0, l.z1 - l.z0));
        M.compose(P, Q, S);
        mesh.setMatrixAt(i, M);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
