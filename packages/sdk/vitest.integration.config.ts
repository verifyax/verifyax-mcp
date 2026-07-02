import { defineConfig } from 'vitest/config';

// Integration tests hit the live VerifyAX API. No msw setup.
const hasKey = !!process.env.VERIFYAX_TEST_KEY;

export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    // Guard against a green-but-blind gate: with a key present, a run that
    // collects/executes nothing is a real failure. Without a key the suite is
    // intentionally empty (self-skipped), so an empty run is success there.
    passWithNoTests: !hasKey,
    // Real API round-trips (generation, simulation, evaluation) are slow.
    testTimeout: 600_000,
    hookTimeout: 120_000,
  },
});
