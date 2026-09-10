import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'VoxelSkyline',
      fileName: 'voxel-skyline',
      formats: ['es'],
    },
    // three 는 앱이 이미 쓰는 것을 그대로 쓴다 (peer dependency)
    rollupOptions: { external: ['three'] },
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
});
