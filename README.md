# voxel-skyline

Turn notes, documents or a CSV into a city you can walk around.

Paste text or drop files in. Headings become **districts**, sub-headings become **buildings**,
and the lines under them become **items**. The number of items sets the building height, and an
optional activity value (0–1) decides how many windows are lit. Buildings you have not filled in
yet stay as empty plots, so the gaps in a knowledge base are as visible as the content.

Built on [three.js](https://threejs.org) with an orthographic camera, instanced trees and cars,
and four window-light levels baked into canvas textures. No build step in the browser, no shaders
to compile, no data leaves the page.

MIT licensed.

## Install

```bash
npm install voxel-skyline three
```

`three` is a peer dependency, so the library uses whichever version your app already has
(`>=0.160`).

## Use

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

Run the bundled demo to try it with your own files:

```bash
git clone https://github.com/junghun133/voxel-skyline
cd voxel-skyline && npm install && npm run dev
```

## Reading text and files

`ingestText(text, name?)`, `ingestTexts([{ name, text }])` and `ingestFiles(fileList)` all return
a `CityData` plus a `notes` array explaining which rule was used, so you can show that to a user.

| Input | How it is read |
| --- | --- |
| Markdown, plain text | `#` is a district, `##` and deeper is a building, list items and paragraphs are items |
| Text with no headings | the file name becomes the district, blank-line separated blocks become buildings |
| CSV, TSV | header columns named district / building / item / activity, otherwise columns 1·2·3 |
| JSON | already-shaped `CityData` is used as is; an array of rows is read like a table |

Nothing is uploaded. Files are read in the browser with the File API.

## Feeding data directly

Skip the parser when you already have structured data:

```ts
city.setData({
  districts: [{ id: 'ops', label: 'Operations', gaps: ['Runbooks'] }],
  buildings: [{ id: 'release', name: 'Release window', districtId: 'ops', count: 12 }],
  items: [{ id: '1', title: 'Tuesday only', buildingId: 'release', activity: 0.9 }],
  links: [{ a: 'release', b: 'oncall' }],
});
```

- `count` sets the height. Ten items is ten floors, then growth slows and stops at 26 floors, so
  one huge building cannot flatten the rest of the city.
- `activity` (0–1) sets the window light. Low activity fades the district colour too, which reads
  as "nobody has touched this in a while".
- `gaps` draws an empty plot with a label. Useful for "we know this is missing".
- `links` between buildings in different districts are drawn as roads, thicker with `weight`.

## API

`createCityRenderer(container, options)` returns:

| Method | What it does |
| --- | --- |
| `setData(data)` | rebuild the city |
| `focusBuilding(id, zoom?)` | zoom to one building, keeping the current angle |
| `focusDistrict(id)` | frame one district |
| `home()` | back to the opening view |
| `zoomBy(factor)` / `setZoom(z)` | zoom |
| `setNight(on)` | night palette, windows light up |
| `setHighlight(ids \| null)` | keep some buildings bright, fade the rest |
| `setActivityThreshold(t)` | anything below `t` goes dark |
| `setPalette(input)` | recolour, e.g. when the page theme changes |
| `setAutoRotate(on)` | slow drift when nobody is interacting |
| `resize()` / `start()` / `stop()` / `dispose()` | lifecycle |
| `on('hover' \| 'select' \| 'view', fn)` | events, returns an unsubscribe function |

Options: `palette`, `night`, `outskirts`, `traffic`, `ambient`, `construction`, `riseSeconds`,
`autoRotate`, `labels`, `formatCount`, `insets`.

Drag to pan, shift-drag or right-drag to rotate, wheel or pinch to zoom, click to select.

## Styling

`voxel-skyline/style.css` styles the label DOM that floats over the canvas
(`.vs-building`, `.vs-district`, `.vs-gap`, `.vs-leaders line`). Copy it or override the classes.
Colours come from the palette instead of CSS, and `readPalette(el, '--vs-')` reads them from CSS
variables if you would rather drive them from your theme.

## Notes

- The camera is orthographic, so the city keeps its isometric look at any zoom. Selecting a
  building only pans and zooms — it never spins the city around.
- Trees, cars and dust are instanced meshes, and window light is four canvas textures shared by
  every building, so a few hundred buildings stay cheap.
- Rendering only. There is no store, no server and no framework binding.

## 한국어

글이나 파일을 넣으면 도시가 됩니다. `#` 제목은 구역, `##` 은 건물, 그 아래 줄은 항목입니다.
항목 수가 건물 높이가 되고, 활성도(0~1)에 따라 창에 불이 들어옵니다. 아직 채우지 못한 자리는
빈 필지로 남아 지식의 공백이 그대로 보입니다.

three.js 위에 정사영 카메라로 그리고, 나무·차량·먼지는 인스턴싱, 창문 조명은 4단계 캔버스
텍스처를 공유합니다. 데이터는 브라우저 밖으로 나가지 않습니다.

```bash
npm install voxel-skyline three
```

자세한 사용법은 위 영어 문서와 `examples/basic` 데모를 참고하세요. 코드 주석은 한국어입니다.

## License

MIT © 2026 Junghun Park
