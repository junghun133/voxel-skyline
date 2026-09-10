import type { OrthographicCamera, Vector3 } from 'three';
import { Vector3 as V3 } from 'three';

export interface Projected {
  x: number;
  y: number;
  /** >1이면 카메라 뒤 */
  z: number;
}

const v = new V3();

/** 월드 좌표 → 컨테이너 픽셀 좌표 */
export function project(
  p: Vector3,
  camera: OrthographicCamera,
  w: number,
  h: number,
  out: Projected,
): Projected {
  v.copy(p).project(camera);
  out.x = (v.x * 0.5 + 0.5) * w;
  out.y = (-v.y * 0.5 + 0.5) * h;
  out.z = v.z;
  return out;
}

export function toggleClass(el: Element, cls: string, on: boolean): void {
  if (on) el.classList.add(cls);
  else el.classList.remove(cls);
}
