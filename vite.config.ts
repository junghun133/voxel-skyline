import { defineConfig } from 'vite';

// `npm run dev` — examples/basic 데모를 띄운다. 라이브러리 빌드는 vite.lib.config.ts 를 쓴다
export default defineConfig({
  root: 'examples/basic',
  server: { port: 5173, open: false },
});
