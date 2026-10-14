import { build } from "esbuild";

await build({
  entryPoints: ["src/main.ts"],
  outfile: "dist/core.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  minify: true,
  keepNames: true,
  legalComments: "none",
  external: ["bufferutil", "utf-8-validate"],
  plugins: [
    {
      name: "stub-bun",
      setup(b) {
        b.onResolve({ filter: /^bun:/ }, (args) => ({ path: args.path, namespace: "stub" }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export const constants = {}; export class Database {}" }));
      },
    },
  ],
  // some cjs deps call require at runtime, which esm output doesn't have
  banner: { js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);' },
  logLevel: "warning",
});
