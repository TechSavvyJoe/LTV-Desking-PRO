import js from "@eslint/js";
import typescript from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import reactRefreshPlugin from "eslint-plugin-react-refresh";

export default [
  js.configs.recommended,
  ...typescript.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
      "react-refresh": reactRefreshPlugin,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      // Console logging is still useful for local PocketBase and AI-provider
      // smoke diagnostics. TypeScript remains the source of truth for types.
      "no-console": "off",

      // TypeScript rules
      "no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-redundant-type-constituents": "off",
      "@typescript-eslint/no-unused-expressions": "off",

      // React rules
      "react/react-in-jsx-scope": "off", // Not needed in React 19
      "react/prop-types": "off", // Using TypeScript
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "off",
      "react-refresh/only-export-components": "off",

      // General code quality
      "no-debugger": "error",
      "no-var": "error",
      "prefer-const": "off",
      "prefer-template": "off",
      "object-shorthand": "off",
      "no-else-return": "off",
    },
  },
  {
    // Ignore build outputs and dependencies
    ignores: [
      "dist/**",
      "node_modules/**",
      "backend/**",
      "*.config.js",
      "*.config.ts",
      "vite.config.ts", // Ignore config files from linting
    ],
  },
];
