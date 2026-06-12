import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Test fixtures legitimately cast mock return values with `as any` (e.g.
  // partial Prisma rows). Relax `no-explicit-any` for test files so the
  // per-file lint hook doesn't block edits to the test suite.
  {
    files: ["**/__tests__/**", "**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Sibling git worktrees carry their own .next/build outputs that
    // should not be linted by the parent checkout.
    ".worktrees/**",
  ]),
]);

export default eslintConfig;
