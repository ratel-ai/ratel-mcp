import type { JsonRequestInit } from "@/App";

export interface CoveredSkill {
  skillId: string;
  score: number;
}

export type IntentCoverage = { status: "covered"; skills: CoveredSkill[] } | { status: "gap" };

export interface IntentRecord {
  content: string;
  coverage: IntentCoverage;
  sessions: string[];
  firstSeen: string;
  lastSeen: string;
}

export interface SessionSummary {
  sessionId: string;
  host?: string;
  cwd?: string;
  analyzedAt: string;
  intentCount: number;
  gapCount: number;
  /** New captured messages since this session was last analyzed. */
  newTurnCount?: number;
}

export interface Cadence {
  everyNMessages: number;
  onIdle: boolean;
}

export interface IntentsIndex {
  version: number;
  intents: IntentRecord[];
  sessions: SessionSummary[];
  cadence?: Cadence;
  /** Master switch: false means capture + analysis are turned off. */
  enabled?: boolean;
  /** True while a fire-and-forget analysis run is in progress on the server. */
  running?: boolean;
  /** Message from the last background run that failed, else null. */
  lastError?: string | null;
}

/** The run is fire-and-forget; the server returns immediately and the UI polls for `running`. */
export interface RunKickoff {
  started: boolean;
  alreadyRunning?: boolean;
}

export type ChatSourceKind = "hooks" | "api" | "cloud";
export type ExtractorProvider = "http" | "naive" | "cloud";
export type SkillGenProvider = "auto" | "anthropic-api" | "claude-cli";

export interface AnalysisSettings {
  enabled?: boolean;
  chatSource?: ChatSourceKind;
  extractor?: {
    provider?: ExtractorProvider;
    endpoint?: string;
    apiKey?: string;
    model?: string;
  };
  cadence?: {
    everyNMessages?: number;
    onIdle?: boolean;
  };
  skillGen?: {
    provider?: SkillGenProvider;
    apiKey?: string;
  };
  coverage?: {
    minScore?: number;
    relativeRatio?: number;
    maxSkills?: number;
  };
}

export interface AnalysisSettingsResponse {
  analysis: AnalysisSettings;
  /** Sentinel the server returns for stored secrets; echo it back to keep them. */
  secretMask: string;
}

export interface SkillDraft {
  name: string;
  description: string;
  tags?: string[];
  body: string;
}

type Request = <T>(path: string, init?: JsonRequestInit) => Promise<T>;

export function fetchIntents(request: Request): Promise<IntentsIndex> {
  return request<IntentsIndex>("/api/intents");
}

export function runIntents(request: Request, sessionId?: string): Promise<RunKickoff> {
  return request<RunKickoff>("/api/intents/run", {
    method: "POST",
    body: sessionId ? { sessionId } : {},
  });
}

export function fetchAnalysisSettings(request: Request): Promise<AnalysisSettingsResponse> {
  return request<AnalysisSettingsResponse>("/api/analysis/settings");
}

export function saveAnalysisSettings(
  request: Request,
  analysis: AnalysisSettings,
): Promise<AnalysisSettingsResponse> {
  return request<AnalysisSettingsResponse>("/api/analysis/settings", {
    method: "PUT",
    body: { analysis },
  });
}

export function offerSkill(request: Request, intent: string): Promise<{ draft: SkillDraft }> {
  return request<{ draft: SkillDraft }>("/api/skills/offer", {
    method: "POST",
    body: { intent },
  });
}

export function deleteIntent(request: Request, content: string): Promise<unknown> {
  return request("/api/intents/delete", { method: "POST", body: { content } });
}

export function clearIntents(request: Request): Promise<unknown> {
  return request("/api/intents/clear", { method: "POST", body: {} });
}

/** Short, human label for a coverage verdict. */
export function coverageLabel(coverage: IntentCoverage): string {
  return coverage.status === "covered"
    ? `Covered by ${coverage.skills.map((s) => s.skillId).join(", ")}`
    : "No matching skill";
}
