import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['tests/build-output/**', 'tests/e2e/**'],
    setupFiles: ['./tests/setup-dom.ts'],
  },
});
