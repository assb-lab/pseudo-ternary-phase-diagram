import react from "@vitejs/plugin-react";
import { defineConfig, lazyPlugins } from "vite-plus";

// The MP API only allows CORS from materialsproject.org, so the local dev/preview
// servers forward /mp-api/* to it. Static hosting has no such proxy.
const mpProxy = {
  "/mp-api": {
    target: "https://api.materialsproject.org",
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/mp-api/, ""),
  },
};

export default defineConfig({
  // Relative asset paths so dist/ works from any sub-path or file host.
  base: "./",
  server: { proxy: mpProxy },
  preview: { proxy: mpProxy },
  fmt: {},
  lint: {
    plugins: ["react", "typescript", "oxc"],
    rules: {
      "react/rules-of-hooks": "error",
      "react/only-export-components": ["warn", { allowConstantExport: true }],
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    options: { typeAware: true, typeCheck: true },
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
  plugins: lazyPlugins(() => [react()]),
});
