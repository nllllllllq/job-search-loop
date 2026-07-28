import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/preload/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js',
    },
    minify: false,
    outDir: resolve(__dirname, 'dist-electron/preload'),
    rollupOptions: {
      external: ['electron'],
    },
    sourcemap: false,
  },
});
