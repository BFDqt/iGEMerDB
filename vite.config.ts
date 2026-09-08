import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/app/test/setup.ts'],
    css: true,
    coverage: {
      provider: 'v8',
      include: ['src/app/**/*.ts', 'src/app/**/*.tsx'],
      exclude: ['src/app/types.ts', 'src/app/test/**', 'src/app/**/*.test.*'],
      thresholds: {
        // Baselines measured after the 2026-09 test-surface expansion;
        // intentionally a few points below the measured values so genuine
        // regressions fail while rounding noise does not.
        statements: 93,
        branches: 76,
        functions: 78,
        lines: 93,
      },
    },
  },
});
