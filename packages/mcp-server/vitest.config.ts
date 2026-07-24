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
      thresholds: { statements: 90, lines: 90, functions: 85, branches: 82 },
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
