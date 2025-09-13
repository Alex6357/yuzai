import { fileURLToPath } from "node:url";

import js from "@eslint/js";
import { includeIgnoreFile } from "@eslint/compat";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";
import prettierConfig from "eslint-config-prettier";
import prettierPlugin from "eslint-plugin-prettier";

const gitignorePath = fileURLToPath(new URL("./.gitignore", import.meta.url));

export default defineConfig(
  includeIgnoreFile(gitignorePath),
  tseslint.configs.strict,
  tseslint.configs.stylistic,
  prettierConfig,
  {
    files: ["lib/**/*.ts", "adapters/**/*.ts", "plugins/**/*.ts"],
    plugins: { js, prettier: prettierPlugin },
    languageOptions: { globals: globals.node },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/unified-signatures": "off",
    },
  },
);
