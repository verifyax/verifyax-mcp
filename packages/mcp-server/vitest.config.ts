import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Resolve the SDK to its TypeScript source during tests so the MCP server's
// unit tests don't require a prior `pnpm build` of @verifyax/sdk.
export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Generated version, the HTTP transport (its own hardening chunk + covered
      // via conformance), and the CLI/bin wiring are outside the unit floor.
      exclude: ['src/version.ts', 'src/index.ts', 'src/http.ts', 'src/main-module.ts'],
      reporter: ['text-summary'],
      // Floor set just below current coverage to stop erosion.
      thresholds: { statements: 90, lines: 90, functions: 85, branches: 82 },
    },
  },
  resolve: {
    alias: {
      '@verifyax/sdk': fileURLToPath(new URL('../sdk/src/index.ts', import.meta.url)),
    },
  },
});
