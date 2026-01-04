import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Test file patterns
    include: ["src/**/*.test.ts"],

    // Use Node environment
    environment: "node",

    // Global test APIs (describe, it, expect, etc.)
    globals: true,

    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/index.ts"],
      // Start with low thresholds, increase over time
      // Current: ~9% (most tests inline pure functions rather than importing)
      thresholds: {
        lines: 5,
        functions: 5,
        branches: 5,
        statements: 5,
      },
    },

    // Timeout for async tests
    testTimeout: 30000,
  },
});
