// 기본 스타일을 dist 로 복사한다 (`voxel-skyline/style.css` 로 임포트)
import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });
copyFileSync('src/style.css', 'dist/style.css');
console.log('copied dist/style.css');
