import { join } from "node:path";
import type { ParsedArgs } from "../cli/args.js";
import { listBackups, restoreLatest, startBackup } from "../cli/backup.js";
import { runImport } from "../cli/handlers/import.js";
import { runLink } from "../cli/handlers/link.js";
import { runMcpAuth } from "../cli/handlers/mcp-auth.js";
import type { HandlerCtx } from "../cli/handlers/types.js";
import { ProjectRootNotFoundError, type RatelScope, ratelConfigPath } from "../cli/hierarchy.js";
import { readJson, writeJson } from "../cli/io.js";
import { parseConfig, type RatelConfig, type ServerEntry } from "../lib/index.js";

const SCOPES: readonly RatelScope[] = ["user", "project", "local"];

export interface ApiResponse {
  status: number;
  body: unknown;
}

function ok(body: unknown): ApiResponse {
  return { status: 200, body };
}

function emptyArgs(group: ParsedArgs["group"], verb?: string): ParsedArgs {
  return { group, verb, configPaths: [], rest: [], extras: [], flags: {} };
}

function withCapture<T>(
  base: HandlerCtx,
  fn: (ctx: HandlerCtx) => Promise<T>,
): Promise<{ result: T; log: string[] }> {
  const log: string[] = [];
  const ctx: HandlerCtx = {
    ...base,
    log: (m) => log.push(m),
  };
  return fn(ctx).then((result) => ({ result, log }));
}

function assertScope(s: unknown): RatelScope {
  if (s === "user" || s === "project" || s === "local") return s;
  throw new Error(`scope must be one of user|project|local, got ${JSON.stringify(s)}`);
}

interface AuthStored {
  tokens?: { access_token?: string };
  expires_at?: number;
}

type AuthStatus = "n/a" | "needs auth" | "expired" | "ok";

async function resolveAuthStatus(
  ctx: HandlerCtx,
  name: string,
  entry: ServerEntry,
): Promise<AuthStatus> {
  if (entry.type !== "http" && entry.type !== "sse") return "n/a";
  if (!ctx.env.homeDir) return "needs auth";
  const path = join(ctx.env.homeDir, ".ratel", "oauth", `${name}.json`);
  const stored = await readJson<AuthStored>(ctx.fs, path);
  if (!stored?.tokens?.access_token) return "needs auth";
  if (typeof stored.expires_at === "number" && stored.expires_at < Date.now()) {
    return "expired";
  }
  return "ok";
}

export async function getConfig(ctx: HandlerCtx): Promise<ApiResponse> {
  const scopes: Record<string, unknown> = {};
  for (const scope of SCOPES) {
    let path: string;
    try {
      path = ratelConfigPath(scope, ctx.env);
    } catch (err) {
      if (err instanceof ProjectRootNotFoundError) {
        scopes[scope] = { available: false };
        continue;
      }
      throw err;
    }
    const cfg = (await readJson<RatelConfig>(ctx.fs, path)) ?? { mcpServers: {} };
    const authStatus: Record<string, AuthStatus> = {};
    for (const [name, entry] of Object.entries(cfg.mcpServers)) {
      authStatus[name] = await resolveAuthStatus(ctx, name, entry);
    }
    scopes[scope] = { available: true, path, config: cfg, authStatus };
  }
  const backups = await listBackups(ctx.env, ctx.fs);
  return ok({
    homeDir: ctx.env.homeDir,
    projectRoot: ctx.env.projectRoot ?? null,
    scopes,
    backups,
  });
}

export async function addServer(
  ctx: HandlerCtx,
  body: { scope?: unknown; name?: unknown; entry?: unknown },
): Promise<ApiResponse> {
  const scope = assertScope(body.scope);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) throw new Error("name is required");
  parseConfig({ mcpServers: { [name]: body.entry } });
  const entry = (body.entry as ServerEntry) ?? {};

  const path = ratelConfigPath(scope, ctx.env);
  const current = (await readJson<RatelConfig>(ctx.fs, path)) ?? { mcpServers: {} };
  if (current.mcpServers[name]) {
    throw new Error(`entry "${name}" already exists at scope ${scope}`);
  }

  const session = startBackup(ctx.env, ctx.fs);
  await session.capture(path);
  await session.finalize("add");

  current.mcpServers[name] = entry;
  await writeJson(ctx.fs, path, current);
  return ok({ name, scope, path });
}

export async function editServer(
  ctx: HandlerCtx,
  name: string,
  body: { scope?: unknown; entry?: unknown },
): Promise<ApiResponse> {
  const scope = assertScope(body.scope);
  parseConfig({ mcpServers: { [name]: body.entry } });
  const entry = body.entry as ServerEntry;

  const path = ratelConfigPath(scope, ctx.env);
  const current = await readJson<RatelConfig>(ctx.fs, path);
  if (!current?.mcpServers[name]) {
    throw new Error(`entry "${name}" not found at scope ${scope}`);
  }

  const session = startBackup(ctx.env, ctx.fs);
  await session.capture(path);
  await session.finalize("edit");

  current.mcpServers[name] = entry;
  await writeJson(ctx.fs, path, current);
  return ok({ name, scope, path });
}

export async function removeServer(
  ctx: HandlerCtx,
  name: string,
  body: { scope?: unknown },
): Promise<ApiResponse> {
  const scope = assertScope(body.scope);
  const path = ratelConfigPath(scope, ctx.env);
  const current = await readJson<RatelConfig>(ctx.fs, path);
  if (!current?.mcpServers[name]) {
    throw new Error(`entry "${name}" not found at scope ${scope}`);
  }

  const session = startBackup(ctx.env, ctx.fs);
  await session.capture(path);
  await session.finalize("remove");

  delete current.mcpServers[name];
  await writeJson(ctx.fs, path, current);
  return ok({ name, scope, path });
}

export async function authServer(ctx: HandlerCtx, name: string): Promise<ApiResponse> {
  if (!name) throw new Error("name is required");
  const argv = emptyArgs("mcp", "auth");
  argv.rest = [name];
  const { log } = await withCapture({ ...ctx, argv }, (c) => runMcpAuth(c));
  return ok({ log });
}

function resolveRatelBin(): string | undefined {
  if (process.env.RATEL_MCP_BIN) return process.env.RATEL_MCP_BIN;
  if (process.argv[1]) return process.argv[1];
  return undefined;
}

export async function doImport(ctx: HandlerCtx): Promise<ApiResponse> {
  const argv = emptyArgs("mcp", "import");
  const { log } = await withCapture({ ...ctx, argv }, (c) =>
    runImport(c, { yes: true, envVar: resolveRatelBin() }).then(() => undefined),
  );
  return ok({ log });
}

export async function doLink(ctx: HandlerCtx): Promise<ApiResponse> {
  const argv = emptyArgs("mcp", "link");
  const { log } = await withCapture({ ...ctx, argv }, (c) =>
    runLink(c, { yes: true, envVar: resolveRatelBin() }).then(() => undefined),
  );
  return ok({ log });
}

export async function undoLatest(ctx: HandlerCtx): Promise<ApiResponse> {
  const restored = await restoreLatest(ctx.env, ctx.fs);
  if (!restored) return ok({ log: ["nothing to undo"] });
  const log = restored.entries.map((e) => `restored ${e.originalPath}`);
  return ok({ log });
}
