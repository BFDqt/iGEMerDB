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
        // Baselines re-measured on the vite 8 / vitest 5 toolchain, whose
        // v8 provider accounts instrumented branches differently than
        // vitest 3 (same code and tests, lower reported percentages).
        // Kept a few points below measured values so genuine regressions
        // fail while rounding noise does not.
        statements: 87,
        branches: 73,
        functions: 86,
        lines: 89,
      },
    },
  },
});
