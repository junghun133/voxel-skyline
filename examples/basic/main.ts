import '../../src/style.css';
import { createCityRenderer, ingestFiles, ingestText } from '../../src/index';
import type { CityItem, IngestResult } from '../../src/index';

const SAMPLE = `# Product
## Mobile approval
- Went responsive instead of a native app
- App review blocks same-day fixes
- Approval has only three screens
## Large upload
- Split files into 5MB chunks
- Retry three times, then resume
- Checksum per chunk

# Operations
## Release window
- Tuesday and Thursday afternoon only
- Friday releases have nobody to watch them
- Severity one defects delay the date
## Night incident
- On-call gets the first alert
- Notify team channel, then service owner
- Share status if it passes thirty minutes

# Team
## First week
- Day one accounts and permissions
- Day two local environment
- Day three read team docs
- Day four first pull request
- Day five watch a release
`;

const app = document.getElementById('app') as HTMLElement;
const textEl = document.getElementById('text') as HTMLTextAreaElement;
const notesEl = document.getElementById('notes') as HTMLUListElement;
const infoEl = document.getElementById('info') as HTMLElement;
const dropEl = document.getElementById('drop') as HTMLElement;

const city = createCityRenderer(app, {
  formatCount: (n) => `${n} items`,
  insets: { left: 356, right: 0 },
});
city.start();

let items: CityItem[] = [];

function apply(result: IngestResult): void {
  items = result.items ?? [];
  city.setData(result);
  notesEl.innerHTML = '';
  for (const n of result.notes) {
    const li = document.createElement('li');
    li.textContent = n;
    notesEl.appendChild(li);
  }
  const b = result.buildings.length;
  const d = result.districts.length;
  infoEl.innerHTML = `<b>${d} districts · ${b} buildings</b><span>${items.length} items</span>`;
}

city.on('select', (b) => {
  if (!b) {
    infoEl.innerHTML = '<b>Nothing selected</b><span>click a building</span>';
    return;
  }
  const mine = items.filter((it) => it.buildingId === b.id).slice(0, 6);
  infoEl.innerHTML =
    `<b>${b.name}</b><span>${b.count} items · ${b.districtId}</span>` +
    (mine.length
      ? `<ul style="margin:6px 0 0;padding-left:16px">${mine
          .map((it) => `<li>${it.title.replace(/</g, '&lt;')}</li>`)
          .join('')}</ul>`
      : '');
});

document.getElementById('build')?.addEventListener('click', () => {
  apply(ingestText(textEl.value, 'notes.md'));
});
document.getElementById('sample')?.addEventListener('click', () => {
  textEl.value = SAMPLE;
  apply(ingestText(SAMPLE, 'sample.md'));
});
let night = false;
document.getElementById('night')?.addEventListener('click', (e) => {
  night = !night;
  city.setNight(night);
  (e.currentTarget as HTMLButtonElement).textContent = night ? 'Day' : 'Night';
});
document.getElementById('home')?.addEventListener('click', () => city.home());
document
  .getElementById('zoomin')
  ?.addEventListener('click', () => city.zoomBy(1.35));
document
  .getElementById('zoomout')
  ?.addEventListener('click', () => city.zoomBy(1 / 1.35));

dropEl.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropEl.classList.add('over');
});
dropEl.addEventListener('dragleave', () => dropEl.classList.remove('over'));
dropEl.addEventListener('drop', (e) => {
  e.preventDefault();
  dropEl.classList.remove('over');
  const files = e.dataTransfer?.files;
  if (!files?.length) return;
  void ingestFiles(files).then(apply);
});

// 콘솔·자동화에서 만져 볼 수 있게 노출한다
(window as unknown as { city: typeof city }).city = city;

// 처음 화면은 예시로 채운다
textEl.value = SAMPLE;
apply(ingestText(SAMPLE, 'sample.md'));
