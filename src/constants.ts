/** 건물 형태 — 항목 수로 자동 배정 */
export type BuildingForm = 'tower' | 'setback' | 'slab' | 'lowblock';

/**
 * 구역별 건물 양식 — 같은 로우폴리 안에서 실루엣만 다르게 보이게 하는 소품 묶음.
 * lab: 연구소(옥상 드럼·배관·수평 핀) · lobby: 방문자 센터(유리 로비·넓은 캐노피)
 * control: 관제탑(중앙 마스트와 링·모서리 기둥) · server: 서버센터(안테나·접시·루버)
 * campus: 캠퍼스(별관을 잇는 브릿지·안마당)
 */
export type BuildingStyle = 'lab' | 'lobby' | 'control' | 'server' | 'campus';
export const BUILDING_STYLES: readonly BuildingStyle[] = [
  'lab',
  'lobby',
  'control',
  'server',
  'campus',
] as const;

/** 구역 순번 → 양식. 데이터에 style 이 있으면 그것을 쓴다 */
export function styleFor(
  index: number,
  style?: BuildingStyle | string,
): BuildingStyle {
  if (style && (BUILDING_STYLES as readonly string[]).includes(style))
    return style as BuildingStyle;
  return BUILDING_STYLES[index % BUILDING_STYLES.length] ?? 'lab';
}

/** 3×2 블록 격자. 블록 200×160, 간선도로 28폭 */
export const CITY = {
  blockW: 200,
  blockD: 160,
  roadW: 28,
  /** 블록 중심 x 좌표 (열) */
  bx: [-228, 0, 228] as const,
  /** 블록 중심 z 좌표 (행) */
  bz: [-94, 94] as const,
  /** 단지 외곽 */
  extX: 372,
  extZ: 218,
  /** 도로 중심선 */
  rx: [-114, 114, -342, 342] as const,
  rz: [0, -188, 188] as const,
  /** 구역 안 건물 슬롯 크기 */
  cellW: 80,
  cellD: 62,
  /** 건물 기준 바닥 */
  footW: 46,
  footD: 36,
  /** 항목 1건당 높이 */
  unitH: 6.4,
  /** 층수가 이 값을 넘으면 완만하게 늘고, maxFloors 에서 멈춘다 (초고층 방지) */
  linearFloors: 10,
  maxFloors: 26,
} as const;

/**
 * 항목 수 → 층수. 10건까지는 1건 = 1층, 그 뒤로는 절반 비율로 완만하게 늘고
 * 26층에서 멈춘다. 15건 ≈ 12층, 30건 ≈ 19층, 50건 = 26층.
 */
export function floorsFor(count: number): number {
  const c = Math.max(0, count);
  const f =
    c <= CITY.linearFloors
      ? c
      : CITY.linearFloors + (c - CITY.linearFloors) * 0.45;
  return Math.max(1, Math.min(CITY.maxFloors, f));
}

/**
 * 구역 색 — 로고 그라데이션(시안→블루→바이올렛)을 쓰되 구역끼리 구분되도록
 * 색상 간격을 넓혔다. 틸 → 시안블루 → 블루 → 바이올렛 → 마젠타.
 */
/**
 * 도시 바깥 외곽 — 시야 이동은 도시 안으로 묶여 있지만, 화면 가장자리까지 땅이 이어지도록
 * 배경용 격자를 더 깐다. 채움 건물·공원·주차장·연못이 들어가고 강이 한쪽을 지난다.
 */
export const OUTSKIRTS = {
  extX: 1060,
  extZ: 660,
  roadW: 14,
  /** 바깥 도로 중심선 (안쪽 도로는 CITY.rx/rz 를 잇는다) */
  rx: [-570, 570, -798, 798] as const,
  rz: [-376, 376, -564, 564] as const,
  /** 칸 중심 (안쪽 3×2 는 제외한다) */
  cx: [-912, -684, -456, -228, 0, 228, 456, 684, 912] as const,
  cz: [-470, -282, -94, 94, 282, 470] as const,
  cellW: 200,
  cellD: 160,
  /** 강 — +z 끝을 따라 흐른다 */
  riverZ: 612,
  riverW: 70,
} as const;

export const DISTRICT_HUES = [
  0x12b5a5, 0x0e8fd4, 0x3f6ae0, 0x7b5ce0, 0xb44fc0,
] as const;

/** 격자 칸 수 */
export const BLOCK_COUNT = CITY.bx.length * CITY.bz.length;

/** 건수 → 형태 */
export function formFor(count: number): BuildingForm {
  return count >= 8
    ? 'tower'
    : count >= 6
      ? 'setback'
      : count >= 5
        ? 'slab'
        : 'lowblock';
}

/** 건수 → 별관 수 */
export function annexCountFor(count: number): number {
  return count >= 8 ? 3 : count >= 6 ? 2 : count >= 4 ? 1 : 0;
}

/** 형태별 매스 비율 (프로토타입 FORMS 그대로) */
export interface FormSpec {
  pod: number;
  podW?: number;
  podD?: number;
  mainW: number;
  mainD: number;
  crown: number;
  crownW?: number;
  crownD?: number;
  upper?: number;
  upperW?: number;
  upperD?: number;
}
export const FORMS: Record<BuildingForm, FormSpec> = {
  tower: {
    pod: 10,
    podW: 1.0,
    podD: 1.0,
    mainW: 0.6,
    mainD: 0.62,
    crown: 7,
    crownW: 0.34,
    crownD: 0.34,
  },
  setback: {
    pod: 0,
    mainW: 0.86,
    mainD: 0.86,
    crown: 0,
    upper: 0.34,
    upperW: 0.6,
    upperD: 0.6,
  },
  slab: {
    pod: 0,
    mainW: 1.08,
    mainD: 0.56,
    crown: 3.4,
    crownW: 0.3,
    crownD: 0.28,
  },
  lowblock: {
    pod: 0,
    mainW: 0.98,
    mainD: 0.9,
    crown: 2.6,
    crownW: 0.42,
    crownD: 0.32,
  },
};

/** 시야 5단계 (정사영 배율 기준). 화면에는 축척 바로만 드러난다 */
export const TIERS = [
  { name: 'city', zoom: 0.86 },
  { name: 'district', zoom: 1.15 },
  { name: 'block', zoom: 1.55 },
  { name: 'building', zoom: 2.15 },
  { name: 'detail', zoom: 3.0 },
] as const;
export const ZOOM_MIN = 0.74;
export const ZOOM_MAX = 3.6;
export const ZOOM_STEP = 1.35;

/** 정사영 카메라 기본 반높이 (zoom 으로 나눈다) */
export const CAMERA_HALF_H = 302;

export const CAMERA = {
  theta0: Math.PI * 0.25,
  /** 처음 시점 — 여섯 블록이 크게 보이도록 위에서 내려다본다 */
  phi0: 0.74,
  /** 처음 시점 배율 (구역 단계) */
  homeZoom: 0.98,
  r: 900,
  phiMin: 0.3,
  phiMax: 1.24,
  easeAngle: 0.06,
  easeTarget: 0.07,
  easeZoom: 0.08,
  dragTheta: 0.005,
  dragPhi: 0.004,
  wheel: 0.0011,
  autoRotate: 0.0006,
  autoRotateDelayMs: 4200,
  overviewRotate: 0.0016,
  onboardingRotate: 0.0022,
  /** 화면 중심보다 도시를 위로 올리는 양(px). 하단 UI가 도시를 가릴 때 쓴다 */
  viewShiftPx: 52,
} as const;
