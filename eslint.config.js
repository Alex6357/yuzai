import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";
import prettierConfig from "eslint-config-prettier";
import prettierPlugin from "eslint-plugin-prettier";

export default defineConfig([
  globalIgnores(["_old/**/*"]),
  {
    files: ["lib/**/*.ts", "adapters/**/*.ts", "plugins/**/*.ts"],
    plugins: { js, prettier: prettierPlugin },
    extends: ["js/recommended"],
    languageOptions: { globals: globals.node },
  },
  tseslint.configs.strict,
  tseslint.configs.stylistic,
  prettierConfig,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/unified-signatures": "off",
    },
  },
]);
