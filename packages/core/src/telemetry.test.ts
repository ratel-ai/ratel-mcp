import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { BackupFs } from "./backup.js";
import type { JsonFs } from "./io.js";
import {
  readLatestToolTokenEstimates,
  recordToolTokenEstimate,
  summarizeToolTokenEstimates,
} from "./telemetry.js";
import { defaultTelemetryDir, projectBucketDir } from "./telemetry-paths.js";

const HOME = "/home/u";
const ROOT = "/repo";

class MemFs implements Pick<BackupFs, "list">, Pick<JsonFs, "read"> {
  files = new Map<string, string>();

  async read(path: string) {
    return this.files.get(path) ?? null;
  }

  async list(path: string) {
    const prefix = path.endsWith("/") ? path : `${path}/`;
    const names = new Set<string>();
    for (const file of this.files.keys()) {
      if (!file.startsWith(prefix)) continue;
      const rest = file.slice(prefix.length);
      const slash = rest.indexOf("/");
      names.add(slash >= 0 ? rest.slice(0, slash) : rest);
    }
    return Array.from(names);
  }
}

function ctx(fs = new MemFs()) {
  return { env: { homeDir: HOME, projectRoot: ROOT }, fs };
}

function telemetryPath(name = "2026-06-19T12-00-00.jsonl") {
  return join(projectBucketDir(defaultTelemetryDir({ homeDir: HOME }), ROOT), name);
}

describe("telemetry tool token estimates", () => {
  it("records tool token estimates to JSONL telemetry", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ratel-telemetry-"));
    const file = join(dir, "trace.jsonl");
    try {
      recordToolTokenEstimate(
        { kind: "jsonl", sessionId: "s1", path: file },
        {
          server: "fs",
          estimate: { toolCount: 2, estimatedTokens: 1024 },
          now: () => Date.UTC(2026, 5, 19, 12),
        },
      );

      const event = JSON.parse((await readFile(file, "utf8")).trim()) as Record<string, unknown>;
      expect(event).toEqual({
        v: 1,
        ts: Date.UTC(2026, 5, 19, 12),
        session_id: "s1",
        type: "ratel_tool_payload",
        server: "fs",
        tool_count: 2,
        estimated_tokens: 1024,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reads deterministic Ratel payload token estimates by server", async () => {
    const fs = new MemFs();
    fs.files.set(
      telemetryPath(),
      [
        JSON.stringify({
          type: "ratel_tool_payload",
          server: "fs",
          tool_count: 2,
          estimated_tokens: 1024,
          ts: Date.UTC(2026, 5, 19, 12),
        }),
        JSON.stringify({
          type: "ratel_tool_payload",
          server: "github",
          tool_count: 1,
          estimated_tokens: 300,
          ts: Date.UTC(2026, 5, 19, 12, 1),
        }),
      ].join("\n"),
    );

    const state = await readLatestToolTokenEstimates(ctx(fs));
    expect(state.byServer.fs).toMatchObject({
      server: "fs",
      toolCount: 2,
      estimatedTokens: 1024,
      lastSeen: "2026-06-19T12:00:00.000Z",
    });
    expect(state.byServer.github.estimatedTokens).toBe(300);
    expect(summarizeToolTokenEstimates(state.byServer)).toEqual({
      hasData: true,
      toolCount: 3,
      estimatedTokens: 1324,
    });
  });

  it("uses the usage module fallback for old upstream_register counts", async () => {
    const fs = new MemFs();
    fs.files.set(
      telemetryPath(),
      `${JSON.stringify({ type: "upstream_register", server: "fs", tool_count: 3 })}\n`,
    );

    const state = await readLatestToolTokenEstimates(ctx(fs));
    expect(state.byServer.fs).toMatchObject({
      server: "fs",
      toolCount: 3,
      estimatedTokens: 390,
    });
    expect(summarizeToolTokenEstimates(state.byServer)).toEqual({
      hasData: true,
      toolCount: 3,
      estimatedTokens: 390,
    });
  });

  it("prefers payload telemetry over count fallback for the same server", async () => {
    const fs = new MemFs();
    fs.files.set(
      telemetryPath(),
      [
        JSON.stringify({ type: "upstream_register", server: "fs", tool_count: 20 }),
        JSON.stringify({
          type: "ratel_tool_payload",
          server: "fs",
          tool_count: 2,
          estimated_tokens: 250,
        }),
      ].join("\n"),
    );

    const state = await readLatestToolTokenEstimates(ctx(fs));
    expect(state.byServer.fs).toMatchObject({
      toolCount: 2,
      estimatedTokens: 250,
    });
  });

  it("returns an empty map without project telemetry", async () => {
    const state = await readLatestToolTokenEstimates({
      env: { homeDir: HOME },
      fs: new MemFs(),
    });
    expect(state.byServer).toEqual({});
    expect(summarizeToolTokenEstimates(state.byServer)).toEqual({
      hasData: false,
      toolCount: 0,
      estimatedTokens: 0,
    });
  });
});
