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
      // Files with no executable code are excluded so the floor reflects real
      // logic coverage: version.ts (generated), index.ts (re-export barrel), and
      // types.ts / types.gen.ts (interfaces/types only — compile to nothing, so
      // they can never be "covered" and otherwise drag the metric down artificially;
      // types.gen.ts is generated from the OpenAPI spec).
      exclude: ['src/version.ts', 'src/index.ts', 'src/types.ts', 'src/types.gen.ts'],
      reporter: ['text-summary'],
      // Floor set just below current coverage to stop erosion.
      thresholds: { statements: 90, lines: 90, functions: 90, branches: 85 },
    },
  },
});
