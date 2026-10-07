import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    // RTL/jsdom integration tests (palette focus, PDF generation) legitimately
    // take a few seconds; the 5s default flaked on loaded dev machines and CI.
    testTimeout: 15_000,
    hookTimeout: 15_000,
    exclude: ["**/node_modules/**", "**/dist/**", "**/tests/e2e/**", "**/tests/helpers/**"],
    // include only unit tests by default
    include: ["**/*.{test,spec}.?(c|m)[jt]s?(x)"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "./coverage",
      // Thresholds enforce minimum coverage in CI (adjust upward over time)
      thresholds: {
        lines: 65,
        functions: 55,
        branches: 53,
        statements: 65,
      },
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/tests/e2e/**",
        "**/tests/helpers/**",
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/playwright.config.ts",
        "**/vite.config.ts",
        "**/vitest.config.ts",
      ],
    },
  },
});
