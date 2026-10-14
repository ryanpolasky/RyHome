import { networkInterfaces } from "node:os";
import { configFile, type ServerConfig } from "./config.js";

export function advertisedURL(config: ServerConfig): string {
  if (config.advertisedURL) return config.advertisedURL.replace(/\/+$/, "");
  return `http://${config.advertisedHost ?? lanAddress() ?? "localhost"}:${config.port}`;
}

export function pairingCode(config: ServerConfig): string {
  const payload = JSON.stringify({ t: config.token, u: advertisedURL(config) });
  return `RYH1.${Buffer.from(payload).toString("base64url")}`;
}

export function printPairing(config: ServerConfig) {
  console.log(`
========================================================
  RyHome Server
  Listening at ${advertisedURL(config)}

  Pairing code (paste into RyHome on Windows):

  ${pairingCode(config)}

  Wrong address? Set "advertisedHost" or "advertisedURL"
  in ${configFile} and restart.
========================================================
`);
}

function lanAddress(): string | undefined {
  const all = Object.entries(networkInterfaces()).flatMap(([name, list]) =>
    (list ?? []).filter((a) => a.family === "IPv4" && !a.internal).map((a) => ({ name, address: a.address }))
  );
  return (all.find((a) => a.name === "en0") ?? all[0])?.address;
}
