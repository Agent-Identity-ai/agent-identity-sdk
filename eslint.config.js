import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/.turbo/**", "**/.next/**"],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      // argsIgnorePattern: standard convention for a parameter an interface/signature requires
      // but a specific implementation genuinely doesn't use (e.g. ResendEmailProvider.
      // releaseMailbox(id) — a no-op because Resend has nothing server-side to release).
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  // apps/dashboard only — the sole package with JSX/React. Kept to just the react-hooks rules
  // (rules-of-hooks, exhaustive-deps) rather than pulling in the full eslint-config-next bundle,
  // consistent with this project's generally minimal-dependency approach.
  {
    files: ["apps/dashboard/**/*.tsx"],
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
];
