import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // apps/web's tsconfig.json sets "jsx": "preserve" for Next.js's own
  // compiler; esbuild picks that up too and would otherwise leave JSX
  // untransformed in tests ("React is not defined"). Force the automatic
  // runtime here so component tests (jsdom + React Testing Library) work
  // regardless of the Next-specific tsconfig setting.
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
