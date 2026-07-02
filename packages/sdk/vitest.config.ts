import { defineConfig } from 'vitest/config';

// Unit tests only. Integration tests make real network calls and must NOT load
// the msw setup (which would intercept and reject them) — see
// vitest.integration.config.ts.
export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Generated (version.ts) and the pure re-export barrel (index.ts) carry no
      // testable logic; excluding them keeps the floor meaningful.
      exclude: ['src/version.ts', 'src/index.ts'],
      reporter: ['text-summary'],
      // Floor set just below current coverage to stop erosion. Line/statement
      // coverage is low because many one-to-one resource methods are untested;
      // raising this floor (by testing those) is tracked as follow-up work.
      thresholds: { statements: 50, lines: 50, functions: 85, branches: 85 },
    },
  },
});
