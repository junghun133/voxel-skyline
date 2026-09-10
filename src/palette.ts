import { Color } from 'three';

/**
 * 도시 색. 기본값을 그대로 쓰거나, 일부만 덮어써서 테마를 바꾼다.
 * 건물 외장은 중립 회청색 하나로 두고 구역 색은 포인트로만 쓰기 때문에,
 * 색을 바꿔도 도시 전체의 차분한 인상은 유지된다.
 */
export interface Palette {
  bg: Color;
  road: Color;
  walk: Color;
  lawn: Color;
  lawn2: Color;
  plot: Color;
  dash: Color;
  plotEdge: Color;
  gapEdge: Color;
  trunk: Color;
  leaf: Color;
  leaf2: Color;
  /** 활성도가 낮은 건물의 창백한 색 */
  pale: Color;
  /** 건물 기본 외장 — 중립 회청색. 구역 색은 포인트로만 쓴다 */
  bldg: Color;
  /** 유리(로비·드럼) */
  glass: Color;
  /** 옥탑 테두리 */
  cap: Color;
  capHi: Color;
  route: Color;
  /** 외곽 강·연못 */
  water: Color;
  routeHi: Color;
  /** 창 조명 */
  winWarm: Color;
  winCool: Color;
  /** 증축 비계 */
  scaffold: Color;
  /** 공사 장비 */
  eqYellow: Color;
  eqYellowDark: Color;
  eqOrange: Color;
  eqDark: Color;
  eqSteel: Color;
  eqSign: Color;
  eqRed: Color;
  eqWhite: Color;
}

/** 기본 색 (밝은 낮 도시) */
export const DEFAULT_PALETTE: Record<keyof Palette, string> = {
  bg: '#f5f6f8',
  road: '#d7dce2',
  walk: '#e9ecf0',
  lawn: '#8fd39b',
  lawn2: '#79c489',
  plot: '#e6e9ed',
  dash: '#f6f8fa',
  plotEdge: '#cbd1d8',
  gapEdge: '#aeb6be',
  trunk: '#8d7259',
  leaf: '#3fa35c',
  leaf2: '#58b96f',
  pale: '#dde2e8',
  bldg: '#b9c3cf',
  glass: '#dff3fa',
  cap: '#5a6b84',
  capHi: '#0e8f97',
  route: '#c9cfd5',
  water: '#9fd0ea',
  routeHi: '#08a7bf',
  winWarm: '#fff0d2',
  winCool: '#8ff4fb',
  scaffold: '#08a7bf',
  eqYellow: '#e9b23c',
  eqYellowDark: '#ce9526',
  eqOrange: '#e07e33',
  eqDark: '#3c424b',
  eqSteel: '#8a929c',
  eqSign: '#f2c53d',
  eqRed: '#d9544b',
  eqWhite: '#f2f4f6',
};

export type PaletteInput = Partial<Record<keyof Palette, string | number>>;

const KEYS = Object.keys(DEFAULT_PALETTE) as (keyof Palette)[];

/** 기본 색에 입력을 덮어써 팔레트를 만든다 */
export function createPalette(input: PaletteInput = {}): Palette {
  const out = {} as Palette;
  for (const k of KEYS) out[k] = new Color(input[k] ?? DEFAULT_PALETTE[k]);
  return out;
}

/**
 * CSS 변수에서 색을 읽는다. `--vs-road` 처럼 접두사 + 케밥케이스 이름을 찾고,
 * 없는 값은 기본색을 쓴다. 페이지 테마(라이트·다크)에 맞춰 도시 색을 따라가게 할 때 쓴다.
 */
export function readPalette(el: HTMLElement, prefix = '--vs-'): Palette {
  const cs = getComputedStyle(el);
  const input: PaletteInput = {};
  for (const k of KEYS) {
    const name = prefix + k.replace(/[A-Z0-9]/g, (m) => '-' + m.toLowerCase());
    const v = cs.getPropertyValue(name).trim();
    if (v) input[k] = v;
  }
  return createPalette(input);
}
