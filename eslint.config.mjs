import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [".local/**", ".next/**", "node_modules/**", "coverage/**", "test-results/**", "playwright-report/**", "next-env.d.ts"],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Plaintext tokens must never reach logs; force callers through the redacting logger.
      "no-console": "error",
      // `ok ? toast.success(..) : toast.error(..)` is the house style for result handling.
      "@typescript-eslint/no-unused-expressions": ["warn", { allowTernary: true, allowShortCircuit: true }],
      // Apostrophes and quotes are fine in JSX text; keep the rule only for the characters that are real typos.
      "react/no-unescaped-entities": ["error", { forbid: [">", "}"] }],
    },
  },
  {
    files: ["scripts/**", "tests/**"],
    rules: { "no-console": "off" },
  },
];

export default config;
