import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const packageRoot = fileURLToPath(new URL('.', import.meta.url));

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
      //
      // Re-based for vitest 4, which makes AST-aware remapping the default in the
      // v8 provider. The same code now measures 87.67 statements / 88.86 lines /
      // 79.87 branches where vitest 3 credited 90+/90+/82+. No test was removed
      // and no code got worse -- the measurement got more accurate, so the old
      // numbers were never describing what we thought. Floors follow actual
      // coverage down, as this comment has always said they should.
      thresholds: { statements: 87, lines: 88, functions: 85, branches: 79 },
    },
  },
  resolve: {
    alias: [
      {
        find: /^\.\.\/dist\/target-env-guard\.js$/,
        replacement: resolve(packageRoot, 'src/target-env-guard.ts'),
      },
      {
        find: '@verifyax/sdk',
        replacement: fileURLToPath(new URL('../sdk/src/index.ts', import.meta.url)),
      },
    ],
  },
});
