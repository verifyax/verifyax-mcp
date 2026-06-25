import { defineConfig } from 'vitest/config';

// Unit tests only. Integration tests make real network calls and must NOT load
// the msw setup (which would intercept and reject them) — see
// vitest.integration.config.ts.
export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
  },
});
