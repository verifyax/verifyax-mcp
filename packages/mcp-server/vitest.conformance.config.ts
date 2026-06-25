import { defineConfig } from 'vitest/config';

// Conformance tests spawn the BUILT server (dist/index.js) as a subprocess and
// speak the MCP protocol over stdio. No SDK source alias here — the subprocess
// runs the real compiled output. `pnpm test:conformance` builds first.
export default defineConfig({
  test: {
    include: ['test/conformance/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
