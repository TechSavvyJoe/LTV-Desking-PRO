import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
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
