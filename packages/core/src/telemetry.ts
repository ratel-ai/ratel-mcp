import { appendFileSync } from "node:fs";
import { join } from "node:path";
import type { TraceSinkConfig } from "@ratel-ai/sdk";
import type { BackupFs } from "./backup.js";
import type { HierarchyEnv } from "./hierarchy.js";
import type { JsonFs } from "./io.js";
import { isPlainObject } from "./json.js";
import { estimateToolCountTokens, type ToolTokenEstimate } from "./lib/usage.js";
import { defaultTelemetryDir, projectBucketDir } from "./telemetry-paths.js";

export interface ServerToolTokenEstimate extends ToolTokenEstimate {
  server: string;
  lastSeen: string | null;
}

export interface ToolTokenEstimateSummary extends ToolTokenEstimate {
  hasData: boolean;
}

export interface ToolTokenEstimateState {
  projectDir: string | null;
  telemetryDir: string | null;
  telemetryFile: string | null;
  byServer: Record<string, ServerToolTokenEstimate>;
}

export interface ToolTokenEstimateReadOptions {
  projectDir?: string | null;
  telemetryDir?: string;
}

export interface ToolTokenEstimateContext {
  env: Pick<HierarchyEnv, "homeDir" | "projectRoot">;
  fs: Pick<JsonFs, "read"> & Pick<BackupFs, "list">;
}

export interface RecordToolTokenEstimateInput {
  server: string;
  estimate: ToolTokenEstimate;
  now?: () => number;
}

interface CountOnlyTelemetry {
  server: string;
  toolCount: number;
  lastSeen: string | null;
}

export function recordToolTokenEstimate(
  trace: TraceSinkConfig | undefined,
  input: RecordToolTokenEstimateInput,
): void {
  appendTelemetryEvent(
    trace,
    {
      type: "ratel_tool_payload",
      server: input.server,
      tool_count: input.estimate.toolCount,
      estimated_tokens: input.estimate.estimatedTokens,
    },
    input.now,
  );
}

export async function readLatestToolTokenEstimates(
  ctx: ToolTokenEstimateContext,
  opts: ToolTokenEstimateReadOptions = {},
): Promise<ToolTokenEstimateState> {
  const projectDir = opts.projectDir ?? ctx.env.projectRoot ?? null;
  if (!projectDir) return emptyToolTokenEstimateState(null, null, null);

  const telemetryDir = projectBucketDir(
    defaultTelemetryDir({ homeDir: ctx.env.homeDir, telemetryDir: opts.telemetryDir }),
    projectDir,
  );
  const files = (await ctx.fs.list(telemetryDir).catch(() => [])).filter((name) =>
    name.endsWith(".jsonl"),
  );
  files.sort();
  const latest = files.at(-1);
  if (!latest) return emptyToolTokenEstimateState(projectDir, telemetryDir, null);

  const telemetryFile = join(telemetryDir, latest);
  const text = await ctx.fs.read(telemetryFile).catch(() => null);
  if (!text) return emptyToolTokenEstimateState(projectDir, telemetryDir, telemetryFile);

  return {
    projectDir,
    telemetryDir,
    telemetryFile,
    byServer: parseToolTokenEstimateTelemetry(text),
  };
}

export function summarizeToolTokenEstimates(
  byServer: Record<string, ServerToolTokenEstimate>,
): ToolTokenEstimateSummary {
  const estimates = Object.values(byServer);
  return {
    hasData: estimates.length > 0,
    toolCount: estimates.reduce((sum, estimate) => sum + estimate.toolCount, 0),
    estimatedTokens: estimates.reduce((sum, estimate) => sum + estimate.estimatedTokens, 0),
  };
}

function parseToolTokenEstimateTelemetry(text: string): Record<string, ServerToolTokenEstimate> {
  const payloadByServer = new Map<string, ServerToolTokenEstimate>();
  const countByServer = new Map<string, CountOnlyTelemetry>();
  let anonymous = 0;

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event: Record<string, unknown> | null = null;
    try {
      event = unwrapTraceEvent(JSON.parse(line));
    } catch {
      continue;
    }
    if (!event) continue;

    const type = typeof event.type === "string" ? event.type : "";
    const server = typeof event.server === "string" ? event.server : `unknown:${anonymous++}`;
    const toolCount = numberValue(event.tool_count) ?? numberValue(event.toolCount) ?? 0;
    const lastSeen = lastSeenFromEvent(event);

    if (type === "ratel_tool_payload") {
      const estimatedTokens =
        numberValue(event.estimated_tokens) ?? numberValue(event.estimatedTokens);
      if (estimatedTokens !== null) {
        payloadByServer.set(server, { server, toolCount, estimatedTokens, lastSeen });
      }
    } else if (type === "upstream_register") {
      countByServer.set(server, { server, toolCount, lastSeen });
    }
  }

  const byServer: Record<string, ServerToolTokenEstimate> = {};
  for (const value of payloadByServer.values()) {
    byServer[value.server] = value;
  }
  for (const value of countByServer.values()) {
    if (byServer[value.server]) continue;
    const fallback = estimateToolCountTokens(value.toolCount);
    byServer[value.server] = {
      server: value.server,
      toolCount: fallback.toolCount,
      estimatedTokens: fallback.estimatedTokens,
      lastSeen: value.lastSeen,
    };
  }
  return byServer;
}

function appendTelemetryEvent(
  trace: TraceSinkConfig | undefined,
  event: Record<string, unknown>,
  now: (() => number) | undefined,
): void {
  if (!trace || trace.kind !== "jsonl") return;
  try {
    appendFileSync(
      trace.path,
      `${JSON.stringify({
        v: 1,
        ts: now ? now() : Date.now(),
        session_id: trace.sessionId,
        ...event,
      })}\n`,
    );
  } catch {
    // Telemetry is best-effort; callers must not fail because tracing did.
  }
}

function emptyToolTokenEstimateState(
  projectDir: string | null,
  telemetryDir: string | null,
  telemetryFile: string | null,
): ToolTokenEstimateState {
  return { projectDir, telemetryDir, telemetryFile, byServer: {} };
}

function unwrapTraceEvent(value: unknown): Record<string, unknown> | null {
  if (!isPlainObject(value)) return null;
  if (typeof value.type === "string") return value;
  if (isPlainObject(value.event)) return value.event;
  if (isPlainObject(value.data)) return value.data;
  return null;
}

function lastSeenFromEvent(event: Record<string, unknown>): string | null {
  const ts = numberValue(event.ts);
  if (ts !== null) return validIsoString(new Date(ts));
  const value = event.ts;
  if (typeof value === "string") return validIsoString(new Date(value));
  return null;
}

function validIsoString(date: Date): string | null {
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
