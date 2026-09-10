import type {
  CityBuildingInput,
  CityData,
  CityDistrictInput,
  CityItem,
} from './types';

/**
 * 텍스트와 파일을 도시 입력으로 바꾼다.
 *
 * 규칙은 하나다. **구역 > 건물 > 항목** 세 계층으로 읽는다.
 * - Markdown·텍스트: `#` 제목이 구역, `##` 제목이 건물, 그 아래 줄이 항목
 * - 제목이 없으면: 파일 이름이 구역이 되고, 빈 줄로 나뉜 덩어리가 각각 건물이 된다
 * - CSV·TSV: 헤더에서 district/building/item/activity 열을 찾고, 없으면 1·2·3열 순서로 읽는다
 * - JSON: 이미 이 형식이면 그대로, `{district, building, item}` 배열이면 표처럼 읽는다
 *
 * 어떤 규칙이 쓰였는지는 결과의 `notes` 로 알 수 있어, 화면에서 안내를 띄울 수 있다.
 */
export interface IngestResult extends CityData {
  notes: string[];
}

const slug = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'x';

class Builder {
  private districts = new Map<string, CityDistrictInput>();
  private buildings = new Map<string, CityBuildingInput>();
  private items: CityItem[] = [];
  readonly notes: string[] = [];

  district(label: string): string {
    const id = 'd-' + slug(label);
    if (!this.districts.has(id)) this.districts.set(id, { id, label });
    return id;
  }

  building(districtId: string, name: string): string {
    const id = 'b-' + slug(districtId + '-' + name);
    if (!this.buildings.has(id))
      this.buildings.set(id, { id, name, districtId });
    return id;
  }

  item(
    buildingId: string,
    title: string,
    text?: string,
    activity?: number,
  ): void {
    const t = title.trim();
    if (!t) return;
    this.items.push({
      id: `i-${this.items.length + 1}`,
      title: t.slice(0, 200),
      text,
      buildingId,
      activity,
    });
  }

  note(s: string): void {
    if (!this.notes.includes(s)) this.notes.push(s);
  }

  get size(): number {
    return this.items.length;
  }

  done(): IngestResult {
    return {
      districts: [...this.districts.values()],
      buildings: [...this.buildings.values()],
      items: this.items,
      notes: this.notes,
    };
  }
}

const HEAD = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;

/** Markdown·평문 한 편을 읽는다. name 은 제목이 없을 때 구역 이름으로 쓴다 */
function readText(b: Builder, text: string, name = 'notes'): void {
  const lines = text.split(/\r?\n/);
  const hasHead = lines.some((l) => HEAD.test(l));
  if (!hasHead) {
    // 제목이 없으면 파일 하나가 구역, 빈 줄로 나뉜 덩어리가 건물
    const districtId = b.district(name);
    const blocks = text
      .split(/\n\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    b.note(
      `제목이 없어 «${name}»을 구역으로 두고 빈 줄로 나뉜 ${blocks.length}덩어리를 건물로 읽었습니다.`,
    );
    blocks.forEach((block, i) => {
      const first = block.split(/\r?\n/)[0] ?? `block ${i + 1}`;
      const buildingId = b.building(districtId, first.slice(0, 40));
      for (const line of block.split(/\r?\n/)) {
        const m = BULLET.exec(line);
        b.item(buildingId, (m ? m[1] : line) ?? '', block);
      }
    });
    return;
  }

  // 제목이 나오기 전까지는 구역을 만들지 않는다 (빈 구역이 생기지 않게)
  let districtId = '';
  let buildingId = '';
  let buffer: string[] = [];
  const flush = (): void => {
    if (!buildingId || !buffer.length) {
      buffer = [];
      return;
    }
    const text2 = buffer.join('\n');
    let any = false;
    for (const line of buffer) {
      const m = BULLET.exec(line);
      if (m) {
        b.item(buildingId, m[1] ?? '', text2);
        any = true;
      }
    }
    if (!any) {
      // 목록이 없으면 문단을 항목으로
      for (const para of text2
        .split(/\n\s*\n/)
        .map((s) => s.trim())
        .filter(Boolean))
        b.item(buildingId, para.split(/\r?\n/)[0] ?? '', para);
    }
    buffer = [];
  };

  for (const line of lines) {
    const m = HEAD.exec(line);
    if (!m) {
      buffer.push(line);
      continue;
    }
    flush();
    const level = (m[1] ?? '#').length;
    const title = (m[2] ?? '').trim();
    if (level === 1) {
      districtId = b.district(title);
      buildingId = '';
    } else {
      if (!districtId) districtId = b.district(name);
      buildingId = b.building(districtId, title);
    }
  }
  flush();
  b.note('제목 단계로 읽었습니다. # 는 구역, ## 이하는 건물입니다.');
}

const splitRow = (line: string, sep: string): string[] =>
  line
    .split(sep)
    .map((c) => c.trim().replace(/^"|"$/g, ''))
    .map((c) => c.replace(/""/g, '"'));

/** CSV·TSV 표를 읽는다 */
function readTable(b: Builder, text: string, name: string): void {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return;
  const sep = (lines[0] ?? '').includes('\t') ? '\t' : ',';
  const head = splitRow(lines[0] ?? '', sep).map((h) => h.toLowerCase());
  const find = (...names: string[]): number =>
    head.findIndex((h) => names.some((n) => h.includes(n)));
  let di = find('district', 'group', '구역', '분야', 'category');
  let bi = find('building', 'topic', '건물', '주제');
  let ii = find('item', 'title', '항목', '제목', 'name');
  const ai = find('activity', 'weight', '활성');
  const hasHeader = di >= 0 || bi >= 0 || ii >= 0;
  if (!hasHeader) {
    di = 0;
    bi = 1;
    ii = 2;
    b.note('헤더를 찾지 못해 1·2·3열을 구역·건물·항목으로 읽었습니다.');
  } else {
    b.note('표 헤더에서 구역·건물·항목 열을 찾아 읽었습니다.');
  }
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const cells = splitRow(line, sep);
    const dLabel = (di >= 0 ? cells[di] : '') || name;
    const bName = (bi >= 0 ? cells[bi] : '') || dLabel;
    const title = (ii >= 0 ? cells[ii] : '') || bName;
    const districtId = b.district(dLabel);
    const buildingId = b.building(districtId, bName);
    const act = ai >= 0 ? Number(cells[ai]) : NaN;
    b.item(
      buildingId,
      title,
      undefined,
      Number.isFinite(act) ? act : undefined,
    );
  }
}

/** 이미 도시 입력 형식인 JSON, 또는 표처럼 생긴 JSON 배열을 읽는다 */
function readJson(b: Builder, text: string, name: string): CityData | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (
    json &&
    typeof json === 'object' &&
    Array.isArray((json as CityData).districts) &&
    Array.isArray((json as CityData).buildings)
  ) {
    b.note('이미 도시 입력 형식인 JSON 이라 그대로 썼습니다.');
    return json as CityData;
  }
  const rows = Array.isArray(json) ? (json as Record<string, unknown>[]) : null;
  if (!rows) return null;
  b.note('JSON 배열을 표처럼 읽었습니다.');
  for (const row of rows) {
    const pick = (...keys: string[]): string => {
      for (const k of keys) {
        const v = row[k];
        if (typeof v === 'string' && v.trim()) return v.trim();
        if (typeof v === 'number') return String(v);
      }
      return '';
    };
    const dLabel =
      pick('district', 'group', 'category', '구역', '분야') || name;
    const bName = pick('building', 'topic', '건물', '주제') || dLabel;
    const title = pick('item', 'title', 'name', '항목', '제목') || bName;
    const districtId = b.district(dLabel);
    const buildingId = b.building(districtId, bName);
    const act = Number(pick('activity', 'weight', '활성'));
    b.item(
      buildingId,
      title,
      pick('text', 'body', '본문') || undefined,
      Number.isFinite(act) && act > 0 ? act : undefined,
    );
  }
  return null;
}

export interface IngestInput {
  /** 파일 이름(확장자로 형식을 고른다). 없으면 내용으로 짐작한다 */
  name?: string;
  text: string;
}

/** 텍스트 여러 편을 한 도시로 읽는다 */
export function ingestTexts(inputs: IngestInput[]): IngestResult {
  const b = new Builder();
  for (const { name = 'notes', text } of inputs) {
    if (!text.trim()) continue;
    const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';
    const base = name.replace(/\.[a-z0-9]+$/i, '');
    if (ext === 'json' || text.trimStart().startsWith('{')) {
      const direct = readJson(b, text, base);
      if (direct) return { ...direct, notes: b.notes };
      if (text.trimStart().startsWith('[')) continue;
    }
    if (ext === 'csv' || ext === 'tsv') {
      readTable(b, text, base);
      continue;
    }
    if (!ext && /^[^\n]*[,\t][^\n]*(\r?\n[^\n]*[,\t])/.test(text)) {
      readTable(b, text, base);
      continue;
    }
    readText(b, text, base);
  }
  if (!b.size)
    b.note('읽을 항목이 없었습니다. 제목이나 목록이 있는 글을 넣어 보세요.');
  return b.done();
}

/** 텍스트 한 편 */
export function ingestText(text: string, name = 'notes'): IngestResult {
  return ingestTexts([{ name, text }]);
}

/** 브라우저에서 고른 파일들 (텍스트 계열만 읽는다) */
export async function ingestFiles(
  files: ArrayLike<File>,
): Promise<IngestResult> {
  const list = Array.from(files);
  const inputs: IngestInput[] = [];
  for (const f of list) {
    if (f.size > 8 * 1024 * 1024) continue;
    inputs.push({ name: f.name, text: await f.text() });
  }
  return ingestTexts(inputs);
}
