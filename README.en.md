<p align="center"><a href="README.md">한국어</a> | English</p>

# voxel-skyline

<p>
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/three.js-000000?style=flat-square&logo=threedotjs&logoColor=white" alt="three.js"/>
  <img src="https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite"/>
  <img src="https://img.shields.io/badge/MIT%20License-3DA639?style=flat-square&logo=opensourceinitiative&logoColor=white" alt="MIT License"/>
</p>

**Paste your notes. Get a city you can walk around.** `#` headings become districts, `##` headings become buildings, and the lines under them become items. A building is as tall as it has items, its windows light up with activity, and anything you have not written yet stays an empty plot. The shape of what you know, and the holes in it, become something you can look at. Built on three.js. Everything runs in the browser.

![A city built from notes](docs/screenshot.png)

## Features

- **Text to city**: reads Markdown, plain text, CSV, TSV and JSON as district > building > item. The result's `notes` tells you which rule was used.
- **Visual encoding**: height is item count, window light is activity (0-1), colour is district, roads are the `links` you declare, an empty plot is a name you listed in `gaps`.
- **Item count to floors**: one item per floor up to 10 items, then growth slows and stops at 26 floors, so one huge building cannot flatten the rest of the city.
- **Controls**: drag to pan, shift-drag or right-drag to rotate, wheel or pinch to zoom, click a building to zoom in without changing the angle, slow auto-rotate when idle.
- **Day/night**, palette override, dimming of low-activity buildings, building highlight.
- **Five building styles**: `lab`, `lobby`, `control`, `server`, `campus`.
- **Ambience**: construction equipment while buildings rise, traffic, drifting particles, outskirts. Each can be turned off by option.
- **Rendering only**: orthographic camera, instanced meshes (traffic, particles and more), four window-light canvas textures shared by all buildings. No store, no server, no framework binding.

![The same city at night](docs/screenshot-night.png)

## Quick start

Requires Node.js 18 or later.

```bash
git clone https://github.com/junghun133/voxel-skyline
cd voxel-skyline
npm install
npm run dev          # http://localhost:5173 (examples/basic demo)
```

| Script | Description |
| --- | --- |
| `npm run dev` | Run the `examples/basic` demo on a Vite dev server (port 5173) |
| `npm run build` | Build the library into `dist` (ES module, type declarations, `style.css`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run format` / `format:check` | Apply / check Prettier |

### Using the demo

1. The page opens with a sample loaded. Cranes and trucks sit on the plots while the buildings rise, then disappear.
2. Replace the text in the left panel with anything that has `#` and `##` headings and press **Build city**. **Sample** restores the sample text.
3. Click a building to zoom in and list its items on the right.
4. **Night** toggles night mode, **Home** returns to the opening view.
5. Drop a `.md`, `.txt`, `.csv` or `.json` file on the drop zone. The note under it says which rule was used.

## Input formats

`ingestText(text, name?)`, `ingestTexts([{ name, text }])` and `ingestFiles(fileList)` return `CityData` plus a `notes` array.

| Input | How it is read |
| --- | --- |
| Markdown, plain text | `#` is a district, `##` and deeper is a building, list items and paragraphs are items |
| Text with no headings | the file name becomes the district, blank-line separated blocks become buildings |
| CSV, TSV | header columns named district / building / item / activity, otherwise columns 1, 2, 3 |
| JSON | an object with `districts` and `buildings` arrays is used as `CityData`; an array of rows is read like a table |

- CSV headers are matched by substring: `district`, `group`, `구역`, `분야`, `category` / `building`, `topic`, `건물`, `주제` / `item`, `title`, `항목`, `제목`, `name` / `activity`, `weight`, `활성`.
- `ingestFiles` uses the browser File API and skips files over 8 MB. Nothing is uploaded.

```csv
district,building,item,activity
Kitchen,Sourdough,Feed the starter the night before,0.9
Garden,Tomatoes,Plant after the last frost,0.2
```

## Library API

> Not published to npm yet. Clone the repo and run `npm run build` to produce `dist`. `three` is a peer dependency (`>=0.160`).

```ts
import { createCityRenderer, ingestText } from 'voxel-skyline';
import 'voxel-skyline/style.css';

const city = createCityRenderer(document.getElementById('app')!, {
  formatCount: (n) => `${n} items`,
});
city.start();

city.setData(
  ingestText(`
# Kitchen
## Sourdough
- Feed the starter the night before
- Bulk ferment until it doubles

# Garden
## Tomatoes
- Plant after the last frost
`),
);

city.on('select', (building) => {
  if (building) console.log(building.name, building.count);
});
```

### Feeding structured data

```ts
city.setData({
  districts: [{ id: 'garden', label: 'Garden', gaps: ['Compost'] }],
  buildings: [{ id: 'tomatoes', name: 'Tomatoes', districtId: 'garden', count: 12 }],
  items: [{ id: '1', title: 'Water at the base', buildingId: 'tomatoes', activity: 0.9 }],
  links: [{ a: 'tomatoes', b: 'herbs' }],
});
```

- `count` sets the height. Without it, the items are counted.
- `activity` (0-1) sets window light. On a building it defaults to the average of its items.
- `gaps` draws a labelled empty plot.
- `links` draw roads between buildings; `weight` sets thickness.
- Districts also accept `hue`, `blockIndex` (cell 0-5 of a 3x2 grid), `style` and `description`.

### `createCityRenderer(container, options)` returns

| Member | What it does |
| --- | --- |
| `setData(data)` | rebuild the city |
| `getLayout()` | current layout with computed positions and sizes |
| `focusBuilding(id, zoom?)` | zoom to one building, keeping the current angle |
| `focusDistrict(id)` | frame one district |
| `home()` | back to the opening view |
| `zoomBy(factor)` / `setZoom(z)` | zoom |
| `setNight(on)` | night palette |
| `setHighlight(ids \| null)` | keep some buildings bright, fade the rest |
| `setActivityThreshold(t)` | buildings below `t` go dark |
| `setPalette(input)` | recompute colours, e.g. on theme change |
| `setAutoRotate(on)` | slow drift when idle |
| `resize()` / `start()` / `stop()` / `dispose()` | lifecycle |
| `on('hover' \| 'select' \| 'view', fn)` | events; returns an unsubscribe function |
| `canvas` | the canvas created by three.js (read-only) |

Options: `palette`, `night`, `outskirts`, `traffic`, `ambient`, `construction`, `riseSeconds` (default 2.6), `autoRotate`, `labels`, `formatCount`, `insets`.

### Styling

`voxel-skyline/style.css` styles the labels over the canvas (`.vs-building`, `.vs-district`, `.vs-gap`, `.vs-leaders line`). Colours come from the palette; `readPalette(el, '--vs-')` reads them from CSS variables.

## Tech stack

| Area | Used |
| --- | --- |
| Rendering | three.js (orthographic camera, instanced meshes, canvas textures) |
| Language | TypeScript 5 |
| Build | Vite 5 (library mode, ES module), vite-plugin-dts |
| Formatting | Prettier |

## Project structure

```text
src/
  index.ts        public API
  renderer.ts     createCityRenderer, controls, labels, events
  ingest.ts       text and files -> CityData
  layout.ts       district grid, floors and forms
  buildings.ts    building styles, window-light textures
  scene.ts  camera.ts  palette.ts  constants.ts  types.ts
  construction.ts  traffic.ts  ambient.ts  outskirts.ts
  style.css       label styles
examples/basic/   Vite demo (npm run dev)
docs/             screenshots
assets/           README banner
scripts/          build helper (CSS copy)
```

## Contributing

Issues and PRs are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). Release history is in [CHANGELOG.md](CHANGELOG.md). Code comments are written in Korean.

## License

[MIT](LICENSE) © 2026 Junghun Park
