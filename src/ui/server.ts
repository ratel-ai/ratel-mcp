import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import type { HandlerCtx } from "../cli/handlers/types.js";
import {
  type ApiResponse,
  addServer,
  authServer,
  doImport,
  doLink,
  editServer,
  getConfig,
  removeServer,
  undoLatest,
} from "./routes.js";
import {
  constantTimeEqual,
  extractBearer,
  extractTokenFromUrl,
  isLoopbackHost,
  UI_HOST,
} from "./security.js";
import { INDEX_HTML } from "./static.js";

export interface StartUiServerOptions {
  ctx: HandlerCtx;
  token: string;
  port?: number;
}

export interface UiServerHandle {
  url: string;
  port: number;
  shutdown(): Promise<void>;
}

export async function startUiServer(opts: StartUiServerOptions): Promise<UiServerHandle> {
  const server = createHttpServer((req, res) => {
    handleRequest(req, res, opts).catch((err) => {
      writeJson(res, 500, { error: (err as Error).message });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 0, UI_HOST, () => resolve());
  });

  const port = (server.address() as AddressInfo).port;
  const url = `http://${UI_HOST}:${port}/?t=${opts.token}`;

  return {
    url,
    port,
    shutdown: () => closeServer(server),
  };
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: StartUiServerOptions,
): Promise<void> {
  const port = (req.socket.localPort as number | undefined) ?? 0;

  if (!isLoopbackHost(req.headers.host, port)) {
    writePlain(res, 400, "Invalid Host header");
    return;
  }

  const url = req.url ?? "/";
  const path = url.split("?")[0];

  // Token check: query param for GET /, bearer for everything else.
  if (req.method === "GET" && path === "/") {
    const queryToken = extractTokenFromUrl(url);
    if (!queryToken || !constantTimeEqual(queryToken, opts.token)) {
      writePlain(res, 401, "Unauthorized");
      return;
    }
    writeHtml(res, 200, INDEX_HTML);
    return;
  }

  const bearer = extractBearer(req.headers.authorization);
  if (!bearer || !constantTimeEqual(bearer, opts.token)) {
    writeJson(res, 401, { error: "unauthorized" });
    return;
  }

  try {
    const response = await route(req, path, opts.ctx);
    if (!response) {
      writeJson(res, 404, { error: "not found" });
      return;
    }
    writeJson(res, response.status, response.body);
  } catch (err) {
    writeJson(res, 400, { error: (err as Error).message });
  }
}

async function route(
  req: IncomingMessage,
  path: string,
  ctx: HandlerCtx,
): Promise<ApiResponse | null> {
  const method = req.method ?? "GET";

  if (method === "GET" && path === "/api/config") {
    return getConfig(ctx);
  }
  if (method === "POST" && path === "/api/servers") {
    const body = await readJsonBody(req);
    return addServer(ctx, body);
  }

  const serverMatch = /^\/api\/servers\/([^/]+)$/.exec(path);
  if (serverMatch) {
    const name = decodeURIComponent(serverMatch[1]);
    if (method === "PATCH") {
      const body = await readJsonBody(req);
      return editServer(ctx, name, body);
    }
    if (method === "DELETE") {
      const body = await readJsonBody(req);
      return removeServer(ctx, name, body);
    }
  }

  const authMatch = /^\/api\/auth\/([^/]+)$/.exec(path);
  if (method === "POST" && authMatch) {
    const name = decodeURIComponent(authMatch[1]);
    return authServer(ctx, name);
  }

  if (method === "POST" && path === "/api/import") {
    return doImport(ctx);
  }
  if (method === "POST" && path === "/api/link") {
    return doLink(ctx);
  }
  if (method === "POST" && path === "/api/backups/undo") {
    return undoLatest(ctx);
  }

  return null;
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) {
    chunks.push(c as Buffer);
    if (chunks.reduce((n, b) => n + b.length, 0) > 1_000_000) {
      throw new Error("request body too large");
    }
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("request body must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    throw new Error(`invalid JSON body: ${(err as Error).message}`);
  }
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function writeHtml(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(body);
}

function writePlain(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}
