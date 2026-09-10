import {
  BLOCK_COUNT,
  CITY,
  DISTRICT_HUES,
  FORMS,
  annexCountFor,
  floorsFor,
  formFor,
  styleFor,
  type BuildingForm,
  type BuildingStyle,
} from './constants';
import type { CityData, CityItem } from './types';

export type Vec2 = [number, number];

export interface Gap {
  name: string;
  at: Vec2;
}

export interface District {
  id: string;
  label: string;
  hue: number;
  description: string;
  /** 블록 중심 (x, z) */
  at: Vec2;
  gaps: Gap[];
  /** 구역에 속한 항목 수 */
  count: number;
  /** 구역 건물 양식 */
  style: BuildingStyle;
}

export interface Building {
  id: string;
  name: string;
  districtId: string;
  /** 이 건물에 쌓인 항목 id */
  itemIds: string[];
  count: number;
  /** 0~1 활성도 — 창 조명에 쓴다 */
  activity: number;
  /** 필지 중심 (x, z) */
  at: Vec2;
  form: BuildingForm;
  style: BuildingStyle;
  /** 바닥 폭·깊이 */
  bw: number;
  bd: number;
  /** 포디움 높이 */
  podH: number;
  /** 본체 높이 */
  mainH: number;
  annexCount: number;
  /** slab 형태는 번갈아 90도 회전 */
  rotY: number;
}

export interface Route {
  aId: string;
  bId: string;
  weight: number;
}

export interface CityLayout {
  districts: District[];
  buildings: Building[];
  routes: Route[];
  parks: Vec2[];
  itemsByBuilding: Map<string, CityItem[]>;
  districtById: Map<string, District>;
  buildingById: Map<string, Building>;
}

/** 격자 칸(0~BLOCK_COUNT-1) → 블록 중심 좌표. 왼쪽 위부터 행 순서 */
export function blockCenter(index: number): Vec2 {
  const cols = CITY.bx.length;
  const c = index % cols;
  const r = Math.floor(index / cols);
  return [CITY.bx[c] ?? 0, CITY.bz[r] ?? 0];
}

/** 본체 높이 — 층수(항목 수에서 완만하게 상한을 둔 값)에서 포디움을 뺀 값, 최소 1개층 */
export function mainHeightFor(count: number, podH: number): number {
  return Math.max(CITY.unitH, floorsFor(count) * CITY.unitH - podH);
}

const avg = (xs: number[]): number =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1;

/**
 * 입력 데이터를 도시 배치로 바꾼다.
 * - 구역은 `blockIndex`(없으면 등장 순서)로 격자에 앉고, 남은 칸은 공원이 된다
 * - 구역 안에서는 다른 구역과 연결이 많은 건물을 앞 슬롯에 둬 관련 건물이 붙는다
 * - 건물 크기·형태·별관 수는 항목 수에서 파생한다
 */
export function layoutCity(data: CityData): CityLayout {
  const used = new Set<number>();
  const districtBlocks = new Map<string, number>();
  data.districts.forEach((d, i) => {
    let idx = d.blockIndex;
    if (idx === undefined || idx < 0 || idx >= BLOCK_COUNT || used.has(idx)) {
      idx = i;
      while (used.has(idx) && idx < BLOCK_COUNT) idx++;
    }
    used.add(idx);
    districtBlocks.set(d.id, idx);
  });

  // 건물별 항목
  const itemsByBuilding = new Map<string, CityItem[]>();
  for (const b of data.buildings) itemsByBuilding.set(b.id, []);
  for (const it of data.items ?? []) {
    const arr = itemsByBuilding.get(it.buildingId);
    if (arr) arr.push(it);
  }

  // 건물별 외부 연결 수 — 앞 슬롯 배정 기준
  const districtOf = new Map(data.buildings.map((b) => [b.id, b.districtId]));
  const crossCount = new Map<string, number>();
  for (const b of data.buildings) crossCount.set(b.id, 0);
  for (const l of data.links ?? []) {
    const da = districtOf.get(l.a);
    const db = districtOf.get(l.b);
    if (da === undefined || db === undefined || da === db) continue;
    crossCount.set(l.a, (crossCount.get(l.a) ?? 0) + 1);
    crossCount.set(l.b, (crossCount.get(l.b) ?? 0) + 1);
  }

  const districts: District[] = [];
  const buildings: Building[] = [];

  data.districts.forEach((d, di) => {
    const at = blockCenter(districtBlocks.get(d.id) ?? di);
    const style = styleFor(di, d.style);
    const gapNames = d.gaps ?? [];
    const mine = data.buildings.filter((b) => b.districtId === d.id);
    const total = mine.length + gapNames.length;
    const cols = Math.min(2, Math.max(1, total));
    const rows = Math.max(1, Math.ceil(total / cols));
    const w = cols * CITY.cellW;
    const dd = rows * CITY.cellD;
    const slots: Vec2[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        slots.push([
          at[0] - w / 2 + CITY.cellW * (c + 0.5),
          at[1] - dd / 2 + CITY.cellD * (r + 0.5),
        ]);
      }
    }
    const ordered = [...mine].sort(
      (a, b) => (crossCount.get(b.id) ?? 0) - (crossCount.get(a.id) ?? 0),
    );
    let count = 0;
    ordered.forEach((b, i) => {
      const items = itemsByBuilding.get(b.id) ?? [];
      const c = b.count ?? items.length;
      count += c;
      const form = formFor(c);
      const spec = FORMS[form];
      const scale = 0.78 + Math.min(c, 12) * 0.035;
      const podH = spec.pod;
      buildings.push({
        id: b.id,
        name: b.name,
        districtId: d.id,
        itemIds: items.map((it) => it.id),
        count: c,
        activity: b.activity ?? avg(items.map((it) => it.activity ?? 1)) ?? 1,
        at: slots[i] ?? at,
        form,
        style,
        bw: CITY.footW * scale,
        bd: CITY.footD * scale,
        podH,
        mainH: mainHeightFor(c, podH),
        // 캠퍼스 양식은 별관이 있어야 브릿지로 이을 수 있으니 최소 둘을 둔다
        annexCount: Math.max(annexCountFor(c), style === 'campus' ? 2 : 0),
        rotY: form === 'slab' && i % 2 === 1 ? Math.PI / 2 : 0,
      });
    });
    const gaps: Gap[] = gapNames.map((name, i) => ({
      name,
      at: slots[ordered.length + i] ?? slots[slots.length - 1] ?? at,
    }));
    districts.push({
      id: d.id,
      label: d.label,
      hue:
        d.hue ?? DISTRICT_HUES[di % DISTRICT_HUES.length] ?? DISTRICT_HUES[0],
      description: d.description ?? '',
      at,
      gaps,
      count,
      style,
    });
  });

  // 남은 격자 칸 = 공원
  const parks: Vec2[] = [];
  for (let i = 0; i < BLOCK_COUNT; i++)
    if (!used.has(i)) parks.push(blockCenter(i));

  // 건물 간 통행량 — 다른 구역을 잇는 연결만 도로로 그린다
  const weights = new Map<string, number>();
  for (const l of data.links ?? []) {
    const da = districtOf.get(l.a);
    const db = districtOf.get(l.b);
    if (da === undefined || db === undefined || da === db) continue;
    const key = [l.a, l.b].sort().join(' ');
    weights.set(key, (weights.get(key) ?? 0) + (l.weight ?? 1));
  }
  const routes: Route[] = [];
  weights.forEach((weight, key) => {
    const [aId, bId] = key.split(' ');
    if (aId && bId) routes.push({ aId, bId, weight });
  });

  return {
    districts,
    buildings,
    routes,
    parks,
    itemsByBuilding,
    districtById: new Map(districts.map((d) => [d.id, d] as const)),
    buildingById: new Map(buildings.map((b) => [b.id, b] as const)),
  };
}
