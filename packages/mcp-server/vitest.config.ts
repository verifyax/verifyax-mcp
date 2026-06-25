import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Resolve the SDK to its TypeScript source during tests so the MCP server's
// unit tests don't require a prior `pnpm build` of @verifyax/sdk.
export default defineConfig({
  resolve: {
    alias: {
      '@verifyax/sdk': fileURLToPath(new URL('../sdk/src/index.ts', import.meta.url)),
    },
  },
});
