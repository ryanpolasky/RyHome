import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
export interface HttpConfig {
  token: string;
  port: number;
  host: string;
  allowedOrigins?: string[];
}

const MAX_BODY = 64 * 1024;
const AUTH_TIMEOUT_MS = 10_000;
const HEARTBEAT_MS = 30_000;
const POLICY_VIOLATION = 1008;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export type Handler = (params: string[], body: unknown) => Promise<unknown>;
export type Route = [method: string, pattern: RegExp, handler: Handler];

function tokenMatches(expected: string, given: string | undefined): boolean {
  if (!given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

function bearer(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new ApiError(413, "invalid_request", "Request body is too large."));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => {
      if (chunks.length === 0) return resolve(undefined);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new ApiError(400, "invalid_request", "Body must be JSON."));
      }
    });
    req.on("error", reject);
  });
}

export function startHttp(config: HttpConfig, routes: Route[]) {
  const clients = new Set<WebSocket>();
  const originAllowed = (origin: string | undefined) =>
    !origin || !config.allowedOrigins || config.allowedOrigins.includes(origin);

  const send = (res: ServerResponse, status: number, body?: unknown) => {
    if (body === undefined) {
      res.writeHead(status).end();
    } else {
      res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
    }
  };

  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && originAllowed(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    }
    if (req.method === "OPTIONS") return send(res, 204);
    try {
      if (!originAllowed(origin)) throw new ApiError(403, "unauthorized", "Origin not allowed.");
      if (!tokenMatches(config.token, bearer(req))) throw new ApiError(401, "unauthorized", "Missing or invalid token.");
      const path = new URL(req.url ?? "/", "http://localhost").pathname;
      for (const [method, pattern, handler] of routes) {
        const match = pattern.exec(path);
        if (!match) continue;
        if (req.method !== method) continue;
        const body = await readBody(req);
        const result = await handler(match.slice(1).map(decodeURIComponent), body);
        return send(res, result === undefined ? 204 : 200, result);
      }
      throw new ApiError(404, "not_found", "No such endpoint.");
    } catch (e) {
      const error = e instanceof ApiError ? e : new ApiError(500, "internal", (e as Error).message ?? "Something went wrong.");
      if (error.status >= 500) console.error(e);
      send(res, error.status, { error: { code: error.code, message: error.message } });
    }
  });

  const wss = new WebSocketServer({ noServer: true });
  const alive = new WeakSet<WebSocket>();

  server.on("upgrade", (req, socket, head) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (path !== "/v1/events" || !originAllowed(req.headers.origin)) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      alive.add(ws);
      ws.on("pong", () => alive.add(ws));
      const admit = () => {
        clearTimeout(timer);
        clients.add(ws);
      };
      const timer = setTimeout(() => ws.close(POLICY_VIOLATION, "auth timeout"), AUTH_TIMEOUT_MS);
      if (tokenMatches(config.token, bearer(req))) admit();
      ws.on("message", (raw) => {
        if (clients.has(ws)) return;
        try {
          const frame = JSON.parse(raw.toString());
          if (frame.type === "auth" && tokenMatches(config.token, frame.token)) return admit();
        } catch {}
        ws.close(POLICY_VIOLATION, "unauthorized");
      });
      ws.on("close", () => {
        clearTimeout(timer);
        clients.delete(ws);
      });
    });
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.has(ws)) {
        ws.terminate();
        continue;
      }
      alive.delete(ws);
      ws.ping();
    }
  }, HEARTBEAT_MS);
  server.on("close", () => clearInterval(heartbeat));

  server.listen(config.port, config.host);

  return {
    server,
    broadcast(event: unknown) {
      const frame = JSON.stringify(event);
      for (const ws of clients) ws.send(frame);
    },
  };
}
