import { readFile } from "node:fs/promises";
import { build } from "esbuild";

// some devices stay quiet on a new fabric until pairing ends, so reuse the address pase already reached
const PASE_LINE = "peer.descriptor.sessionParameters = ephemeralSession.parameters;";
const PASE_FALLBACK = `${PASE_LINE}
          if (peer.descriptor.operationalAddress === void 0) {
            const paseAddress = ephemeralSession.channel?.networkAddress;
            if (paseAddress?.type === "udp" || paseAddress?.type === "tcp") peer.descriptor.operationalAddress = { ...paseAddress };
          }`;

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
    {
      name: "pase-address-fallback",
      setup(b) {
        b.onLoad({ filter: /@matter[\\/]protocol[\\/]dist[\\/]esm[\\/]peer[\\/]ControllerCommissioner\.js$/ }, async (args) => {
          const source = await readFile(args.path, "utf8");
          if (!source.includes(PASE_LINE)) throw new Error("matter.js changed; re-check the pase address fallback in bundle.mjs");
          return { contents: source.replace(PASE_LINE, PASE_FALLBACK), loader: "js" };
        });
      },
    },
  ],
  // some cjs deps call require at runtime, which esm output doesn't have
  banner: { js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);' },
  logLevel: "warning",
});
