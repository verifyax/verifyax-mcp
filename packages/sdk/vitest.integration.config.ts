import { defineConfig } from 'vitest/config';

// Integration tests hit the live VerifyAX API. No msw setup. The suite itself
// self-skips when VERIFYAX_TEST_KEY is absent, so this config is safe to run
// anywhere; it just does nothing without a key.
export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    // Without VERIFYAX_TEST_KEY the suite is fully skipped (zero collected
    // tests); that is success, not failure.
    passWithNoTests: true,
    // Real API round-trips (generation, simulation, evaluation) are slow.
    testTimeout: 600_000,
    hookTimeout: 120_000,
  },
});
