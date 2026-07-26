import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.ts',
    // css: false was removed — keep CSS processing enabled so that importing a
    // non-existent CSS module fails the test immediately rather than silently
    // succeeding. CI will catch missing CSS imports as a Vite transform error.
    coverage: {
      provider: 'v8',
      // Collect coverage only from source files (not test helpers or generated files)
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        // Entry points — not unit-testable in isolation
        'src/main.tsx',
        // Pure type definitions
        'src/types.ts',
        // Test setup helper
        'src/test-setup.ts',
        // Next.js / framework scaffold pages that have no unit tests yet
        'src/app/**',
        'src/pages/**',
        // Placeholder component pending implementation
        'src/components/hello.tsx',
      ],
      // Enforce minimum coverage thresholds on testable source.
      // CI will fail (exit non-zero) if any metric drops below these values.
      // Baseline measured at ~69% lines / ~77% functions / ~74% branches.
      // Raise these values as test coverage improves.
      thresholds: {
        lines: 65,
        functions: 70,
        branches: 70,
        statements: 65,
      },
    },
  },
});
