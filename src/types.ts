import type { BuildingStyle } from './constants';

/** 건물 하나에 쌓이는 항목 — 텍스트 한 덩어리 또는 파일에서 뽑은 조각 */
export interface CityItem {
  id: string;
  /** 목록에 보일 한 줄 제목 */
  title: string;
  /** 본문(선택) */
  text?: string;
  /** 이 항목이 속한 건물 */
  buildingId: string;
  /**
   * 0~1 활성도. 창 조명 밝기로 쓴다. 없으면 1.
   * 최근 수정일 같은 값을 0~1로 정규화해 넣으면 오래된 항목의 불이 꺼진다.
   */
  activity?: number;
}

/** 건물 = 항목 묶음. 항목 수가 높이, 구역이 위치를 정한다 */
export interface CityBuildingInput {
  id: string;
  name: string;
  districtId: string;
  /** 항목 수를 직접 줄 때. 없으면 items 개수를 센다 */
  count?: number;
  /** 0~1 활성도. 없으면 항목들의 평균 */
  activity?: number;
}

/** 구역 = 건물 묶음. 3×2 격자의 한 칸을 차지한다 */
export interface CityDistrictInput {
  id: string;
  label: string;
  /** 구역 색(0xRRGGBB). 없으면 순번대로 기본 팔레트에서 고른다 */
  hue?: number;
  /** 격자 칸(0~5). 없으면 등장 순서 */
  blockIndex?: number;
  /** 건물 양식. 없으면 순번대로 배정 */
  style?: BuildingStyle;
  description?: string;
  /** 아직 채워지지 않은 자리 이름 — 빈 필지로 표시된다 */
  gaps?: string[];
}

/** 건물 사이 통행로 — 굵기는 weight */
export interface CityLinkInput {
  a: string;
  b: string;
  weight?: number;
}

/** 렌더러에 넣는 입력 한 벌 */
export interface CityData {
  districts: CityDistrictInput[];
  buildings: CityBuildingInput[];
  items?: CityItem[];
  links?: CityLinkInput[];
}

export const EMPTY_CITY: CityData = { districts: [], buildings: [] };
