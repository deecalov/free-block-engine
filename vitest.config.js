import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.js'],
    coverage: {
      provider: 'v8',
      // Only the library counts: the demo, benchmarks and scripts are not under test.
      include: ['src/**'],
      reporter: ['text', 'lcov'],
      // Ratchet: set to the measured floor so CI catches regressions.
      // Raise these whenever a change lifts the numbers.
      thresholds: {
        lines: 87,
        functions: 82,
        branches: 72,
        statements: 84,
      },
    },
  },
});
