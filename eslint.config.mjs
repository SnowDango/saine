import eslint from "@eslint/js"
import tseslint from "typescript-eslint"
import prettierConfig from "eslint-config-prettier"
import globals from "globals"

export default tseslint.config(
  {
    ignores: [
      "node_modules/",
      "build/",
      ".plasmo/",
      "*.js",
      "*.mjs",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        chrome: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["tests/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["tools/**/*.mjs"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-console": "off",
    },
  },
)

