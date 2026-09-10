import { OrthographicCamera, Vector3 } from 'three';
import {
  CAMERA_HALF_H,
  CITY,
  CAMERA,
  TIERS,
  ZOOM_MAX,
  ZOOM_MIN,
} from './constants';

export interface Orbit {
  theta: number;
  phi: number;
  tTheta: number;
  tPhi: number;
  target: Vector3;
  tTarget: Vector3;
  r: number;
  zoom: number;
  tZoom: number;
}

export function createOrbit(): Orbit {
  return {
    theta: CAMERA.theta0,
    phi: CAMERA.phi0,
    tTheta: CAMERA.theta0,
    tPhi: CAMERA.phi0,
    target: new Vector3(),
    tTarget: new Vector3(),
    r: CAMERA.r,
    zoom: CAMERA.homeZoom,
    tZoom: CAMERA.homeZoom,
  };
}

export const clampZoom = (z: number): number =>
  Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));

/** 배율에서 시야 단계(0~4)를 구한다 */
export function tierOf(zoom: number): number {
  let k = 0;
  TIERS.forEach((t, i) => {
    if (zoom >= t.zoom - 0.001) k = i;
  });
  return k;
}

/** 축척 바 문구 — 80px 이 나타내는 실제 거리 */
export function scaleLabel(zoom: number, viewportH: number): string {
  const h = CAMERA_HALF_H / zoom;
  const worldPerPx = (2 * h) / Math.max(1, viewportH);
  const meters = Math.round((80 * worldPerPx) / 10) * 10;
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`;
}

export function sizeCamera(
  camera: OrthographicCamera,
  zoom: number,
  w: number,
  h: number,
  /** 좌·우에서 카드가 가리는 폭(px). 도시를 남은 공간 가운데로 민다 */
  insets: { left: number; right: number } = { left: 0, right: 0 },
): void {
  const half = CAMERA_HALF_H / zoom;
  const halfW = (half * w) / Math.max(1, h);
  const perPx = (2 * half) / Math.max(1, h);
  // 화면 아래쪽은 질의 카드가 덮으므로 시야를 내려 도시가 위에 오게 한다
  const shiftY = CAMERA.viewShiftPx * perPx;
  const shiftX = ((insets.left - insets.right) / 2) * perPx;
  camera.left = -halfW - shiftX;
  camera.right = halfW - shiftX;
  camera.top = half - shiftY;
  camera.bottom = -half - shiftY;
  camera.updateProjectionMatrix();
}

/** 처음 시점으로 — 도시 중심·기본 각도·가장 넓은 배율. 회전은 가까운 쪽으로 돌린다 */
export function resetOrbit(o: Orbit): void {
  o.tTarget.set(0, 0, 0);
  const turns = Math.round((o.theta - CAMERA.theta0) / (Math.PI * 2));
  o.tTheta = CAMERA.theta0 + turns * Math.PI * 2;
  o.tPhi = CAMERA.phi0;
  o.tZoom = clampZoom(CAMERA.homeZoom);
}

export function applyDrag(o: Orbit, dx: number, dy: number): void {
  o.tTheta -= dx * CAMERA.dragTheta;
  o.tPhi = Math.max(
    CAMERA.phiMin,
    Math.min(CAMERA.phiMax, o.tPhi - dy * CAMERA.dragPhi),
  );
}

/** 카메라가 따라갈 지면 좌표 한계 — 도시를 완전히 벗어나지 않게 묶는다 */
const PAN_LIMIT_X = CITY.extX * 1.15;
const PAN_LIMIT_Z = CITY.extZ * 1.15;

/**
 * 드래그 이동. 화면 픽셀 이동량을 지면 좌표로 환산해 시점을 평행 이동한다.
 * 세로 이동은 카메라가 누운 만큼 지면이 눌려 보이므로 기울기로 나눠 보정한다.
 */
export function applyPan(
  o: Orbit,
  dx: number,
  dy: number,
  viewportH: number,
): void {
  const worldPerPx = (2 * (CAMERA_HALF_H / o.zoom)) / Math.max(1, viewportH);
  const sin = Math.sin(o.theta);
  const cos = Math.cos(o.theta);
  const side = -dx * worldPerPx;
  const fwd = (dy * worldPerPx) / Math.max(0.25, Math.cos(o.phi));
  // 화면 오른쪽 = (cos, -sin), 화면 위쪽(시선의 수평 성분) = (-sin, -cos)
  const x = o.tTarget.x + side * cos + fwd * -sin;
  const z = o.tTarget.z + side * -sin + fwd * -cos;
  o.tTarget.set(
    Math.max(-PAN_LIMIT_X, Math.min(PAN_LIMIT_X, x)),
    0,
    Math.max(-PAN_LIMIT_Z, Math.min(PAN_LIMIT_Z, z)),
  );
  // 손끝을 그대로 따라오게 보간을 건너뛴다
  o.target.copy(o.tTarget);
}

export function applyWheel(o: Orbit, deltaY: number): void {
  o.tZoom = clampZoom(o.tZoom * (1 - deltaY * CAMERA.wheel));
}

/**
 * 지금 보는 각도를 그대로 두고 대상 좌표로 옮기며 확대한다.
 * 사용자가 고른 대상으로 갈 때 쓴다 — 대상마다 방위각을 다시 겨누면 도시가 통째로 돌아 보인다.
 */
export function zoomToPoint(
  o: Orbit,
  x: number,
  z: number,
  zoom?: number,
): void {
  o.tTarget.set(x, 0, z);
  if (zoom !== undefined) o.tZoom = clampZoom(zoom);
}

/** 대상 좌표로 이동하며 궤도 각을 그 방향으로 돌린다 (자동 순회용) */
export function flyToPoint(
  o: Orbit,
  x: number,
  z: number,
  zoom?: number,
  phi?: number,
): void {
  o.tTarget.set(x, 0, z);
  if (zoom !== undefined) o.tZoom = clampZoom(zoom);
  if (phi !== undefined) o.tPhi = phi;
  o.tTheta = Math.atan2(x, z || 0.001) + Math.PI * 0.28;
}

/**
 * 프레임 한 번의 보간 계수. 사양의 상수는 60fps 기준이므로, 실제 프레임 간격에 맞춰
 * 같은 시간에 같은 지점에 닿도록 환산한다(느린 기기에서도 도달 시간이 같다).
 */
function ease(rate: number, dt: number): number {
  return 1 - Math.pow(1 - rate, Math.max(0.001, dt) * 60);
}

export function tickOrbit(
  o: Orbit,
  camera: OrthographicCamera,
  w: number,
  h: number,
  dt = 1 / 60,
  insets: { left: number; right: number } = { left: 0, right: 0 },
): boolean {
  const kAngle = ease(CAMERA.easeAngle, dt);
  o.theta += (o.tTheta - o.theta) * kAngle;
  o.phi += (o.tPhi - o.phi) * kAngle;
  o.target.lerp(o.tTarget, ease(CAMERA.easeTarget, dt));
  const dz = o.tZoom - o.zoom;
  let zoomed = false;
  if (Math.abs(dz) > 0.0005) {
    // 목표에 충분히 가까우면 남은 꼬리를 붙여 시야 단계 표시가 정확히 맞게 한다
    const k = ease(CAMERA.easeZoom, dt);
    o.zoom = Math.abs(dz) < 0.004 ? o.tZoom : o.zoom + dz * k;
    sizeCamera(camera, o.zoom, w, h, insets);
    zoomed = true;
  }
  camera.position.set(
    o.target.x + o.r * Math.sin(o.phi) * Math.sin(o.theta),
    o.target.y + o.r * Math.cos(o.phi),
    o.target.z + o.r * Math.sin(o.phi) * Math.cos(o.theta),
  );
  camera.lookAt(o.target);
  return zoomed;
}
