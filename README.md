# voxel-skyline

**Paste your notes. Get a city you can walk around.**

Headings become districts, sub-headings become buildings, and the lines under them become items.
A building is as tall as it has items, its windows light up with activity, and anything you have
not written yet stays an empty plot. The shape of what you know, and the holes in it, become
something you can look at.

![A city built from notes](docs/screenshot.png)

Built on [three.js](https://threejs.org). Orthographic camera, instanced trees and cars, four
window-light levels baked into canvas textures. Nothing leaves the browser. MIT licensed.

---

## Try it in five minutes

```bash
git clone https://github.com/junghun133/voxel-skyline
cd voxel-skyline
npm install
npm run dev          # http://localhost:5173
```

Then go in this order. Each step takes a few seconds and shows one idea.

**1. Watch a city get built.** The page opens with a sample already loaded. Cranes and trucks sit
on the plots for about three seconds while the buildings rise out of the ground, then the
equipment disappears. That is the whole data set arriving.

**2. Read the skyline before you read anything else.** Two tall buildings in one district and a
single low one in another tells you where the material is. District names float over each block
while you are zoomed out.

**3. Put your own notes in.** Replace the text in the left panel with anything that has `#` and
`##` headings and press **Build city**. The city is rebuilt from your text. Try a
meeting note, a retro, a glossary, a reading list.

**4. Click a building.** The camera zooms in without spinning the city, a ring marks the
building, and the panel on the right lists the items inside it. This is the "open the folder"
moment.

**5. Turn on night.** Windows light up in proportion to activity. If your data has no activity
values every building glows evenly, which is the point of the next step.

**6. Drop a CSV with an activity column.** Drag any `.csv`, `.md`, `.txt` or `.json` file onto
the drop zone. With `district,building,item,activity` headers, buildings with low activity go
dark. Old, untouched material stops shining. The note under the drop zone tells you which rule
was used to read your file.

**7. Move around.** Drag to pan, shift-drag or right-drag to rotate, wheel or pinch to zoom,
**Home** to come back. Leave it alone for a few seconds and the city drifts slowly on
its own.

What to look for while you do this: height is volume, light is recency, colour is which district,
roads between buildings are links you declared, and an empty plot is a gap you named but never
filled.

---

## Use it in your app

```bash
npm install voxel-skyline three
```

`three` is a peer dependency (`>=0.160`), so the library uses whatever version you already have.

```ts
import { createCityRenderer, ingestText } from 'voxel-skyline';
import 'voxel-skyline/style.css';

const city = createCityRenderer(document.getElementById('app')!, {
  formatCount: (n) => `${n} items`,
});
city.start();

city.setData(
  ingestText(`
# Product
## Mobile approval
- Went responsive instead of a native app
- App review blocks same-day fixes
## Large upload
- Split files into 5MB chunks

# Operations
## Release window
- Tuesday and Thursday afternoon only
`),
);

city.on('select', (building) => {
  if (building) console.log(building.name, building.count);
});
```

## Reading text and files

`ingestText(text, name?)`, `ingestTexts([{ name, text }])` and `ingestFiles(fileList)` return
`CityData` plus a `notes` array explaining which rule was used, so you can show that to the user.

| Input                 | How it is read                                                                        |
| --------------------- | ------------------------------------------------------------------------------------- |
| Markdown, plain text  | `#` is a district, `##` and deeper is a building, list items and paragraphs are items |
| Text with no headings | the file name becomes the district, blank-line separated blocks become buildings      |
| CSV, TSV              | header columns named district / building / item / activity, otherwise columns 1·2·3   |
| JSON                  | already-shaped `CityData` is used as is; an array of rows is read like a table        |

Files are read in the browser with the File API. Nothing is uploaded.

## Feeding structured data directly

```ts
city.setData({
  districts: [{ id: 'ops', label: 'Operations', gaps: ['Runbooks'] }],
  buildings: [
    { id: 'release', name: 'Release window', districtId: 'ops', count: 12 },
  ],
  items: [
    { id: '1', title: 'Tuesday only', buildingId: 'release', activity: 0.9 },
  ],
  links: [{ a: 'release', b: 'oncall' }],
});
```

- `count` sets the height. Ten items is ten floors, then growth slows and stops at 26 floors, so
  one huge building cannot flatten the rest of the city.
- `activity` (0–1) sets the window light and fades the district colour when it is low.
- `gaps` draws an empty plot with a label, for "we know this is missing".
- `links` between buildings in different districts are drawn as roads, thicker with `weight`.

## API

`createCityRenderer(container, options)` returns:

| Method                                          | What it does                                    |
| ----------------------------------------------- | ----------------------------------------------- |
| `setData(data)`                                 | rebuild the city                                |
| `focusBuilding(id, zoom?)`                      | zoom to one building, keeping the current angle |
| `focusDistrict(id)`                             | frame one district                              |
| `home()`                                        | back to the opening view                        |
| `zoomBy(factor)` / `setZoom(z)`                 | zoom                                            |
| `setNight(on)`                                  | night palette, windows light up                 |
| `setHighlight(ids \| null)`                     | keep some buildings bright, fade the rest       |
| `setActivityThreshold(t)`                       | anything below `t` goes dark                    |
| `setPalette(input)`                             | recolour, e.g. when the page theme changes      |
| `setAutoRotate(on)`                             | slow drift when nobody is interacting           |
| `resize()` / `start()` / `stop()` / `dispose()` | lifecycle                                       |
| `on('hover' \| 'select' \| 'view', fn)`         | events, returns an unsubscribe function         |

Options: `palette`, `night`, `outskirts`, `traffic`, `ambient`, `construction`, `riseSeconds`,
`autoRotate`, `labels`, `formatCount`, `insets`.

## Styling

`voxel-skyline/style.css` styles the labels that float over the canvas (`.vs-building`,
`.vs-district`, `.vs-gap`, `.vs-leaders line`). Copy it or override the classes. Colours come
from the palette rather than CSS, and `readPalette(el, '--vs-')` reads them from CSS variables if
you would rather drive them from your theme.

## Notes

- The camera is orthographic, so the city keeps its isometric look at any zoom, and selecting a
  building only pans and zooms. It never spins the city around you.
- Trees, cars and dust are instanced meshes, and window light is four canvas textures shared by
  every building, so a few hundred buildings stay cheap.
- Rendering only. No store, no server, no framework binding.

![The same city at night](docs/screenshot-night.png)

---

## 한국어

**글을 붙여 넣으면 도시가 됩니다.** `#` 은 구역, `##` 은 건물, 그 아래 줄은 항목입니다. 항목이
많을수록 건물이 높고, 활성도만큼 창에 불이 들어오며, 아직 쓰지 않은 자리는 빈 필지로 남습니다.
아는 것의 모양과 비어 있는 곳이 눈에 보이게 됩니다.

### 체험 순서

```bash
git clone https://github.com/junghun133/voxel-skyline
cd voxel-skyline && npm install && npm run dev
```

1. **도시가 세워지는 것을 봅니다.** 예시 글이 이미 올라가 있어, 열면 크레인과 트럭이 있는
   공사장에서 건물이 3초쯤 올라온 뒤 장비가 사라집니다.
2. **글을 읽기 전에 스카이라인을 먼저 읽습니다.** 한쪽에 높은 건물 둘, 다른 쪽에 낮은 건물
   하나. 어디에 재료가 쌓였는지 한눈에 보입니다.
3. **내 글을 넣습니다.** 왼쪽 칸의 글을 지우고 `#`·`##` 이 있는 아무 글이나 붙여 넣은 뒤
   「도시 세우기」를 누르면 그 글로 도시가 다시 섭니다.
4. **건물을 누릅니다.** 도시가 회전하지 않고 그 자리에서 확대되며, 오른쪽에 그 건물의 항목이
   나옵니다.
5. **밤을 켭니다.** 활성도만큼 창에 불이 들어옵니다.
6. **CSV 를 떨어뜨립니다.** `district,building,item,activity` 헤더가 있으면 활성도가 낮은
   건물은 어두워집니다. 어떤 규칙으로 읽었는지는 드롭 영역 아래에 문장으로 나옵니다.
7. **돌아다닙니다.** 끌면 이동, 시프트·우클릭 끌기는 회전, 휠은 확대, 「처음 위치」로 복귀.
   가만히 두면 천천히 돕니다.

읽는 법은 넷입니다. 높이는 양, 불빛은 최근 정도, 색은 구역, 건물 사이 도로는 직접 지정한
연결입니다. 빈 필지는 이름만 적어 둔 공백입니다.

코드 주석은 한국어, 공개 문서는 영어를 기준으로 합니다.

## License

MIT © 2026 Junghun Park
