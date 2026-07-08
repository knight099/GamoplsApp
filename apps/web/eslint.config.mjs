// apps/web-local ESLint config: extends the shared @gamopls/config flat
// config and adds an ignore for Next.js's generated `.next/` directory,
// which the shared config doesn't know about (it's Next-specific, not
// something packages/config should carry for every non-Next package).
import base from "../../packages/config/eslint.config.mjs";

export default [
  ...base,
  {
    ignores: ["**/.next/**"],
  },
];
