import type { AnalysisConfig, ExtractorConfig } from "../config.js";
import type {
  AIServiceDescription,
  ChatTurn,
  Claim,
  ClaimSubtype,
  ExtractionResult,
  Intent,
  IntentExtractor,
} from "./types.js";

const CLAIM_SUBTYPES: readonly ClaimSubtype[] = [
  "factoid",
  "capability",
  "user_assertion",
  "unverifiable",
];

/** Injection seam so tests can supply a fake `fetch`. */
export interface HttpExtractorDeps {
  fetch?: typeof fetch;
  /** Abort a single extract after this many ms so a hung/crashed sidecar can't
   *  stall the whole run forever (default 5 min). */
  timeoutMs?: number;
}

const DEFAULT_EXTRACT_TIMEOUT_MS = 300_000;
/** Health probes hit a trivial endpoint; fail fast so the UI's Test button stays snappy. */
const DEFAULT_HEALTH_TIMEOUT_MS = 10_000;

/** Path of the extract endpoint, shared by every deployment (sidecar and hosted). */
const EXTRACT_PATH = "/orbitals/claim-extractor/extract";

/**
 * Talks to an extractor HTTP service over the orbitals claim-extractor contract:
 *
 *   POST {endpoint}/orbitals/claim-extractor/extract
 *   { conversation: [{ role, content }], model?, skip_evidences?, ai_service_description? }
 *   → { extractions: { claims: Claim[], intents: Intent[] }, model, usage, time_taken }
 *
 * The same client serves every deployment — a local Apple-Silicon sidecar, a
 * Docker+GPU box, or the hosted Principled endpoint — so switching deployments is
 * only a change of `endpoint` (and auth). Auth is `bearer` (Authorization: Bearer
 * <apiKey>) or `basic` (Authorization: Basic <base64(username:apiKey)>); a local
 * sidecar needs none. Responses are normalized defensively: the wrapper may be
 * absent (older sidecar), `evidences` may be omitted, subtypes may be Title Case,
 * and rows can be partially shaped.
 */
export class HttpIntentExtractor implements IntentExtractor {
  private readonly endpoint: string;
  private readonly authHeader?: string;
  private readonly model?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(config: ExtractorConfig, deps: HttpExtractorDeps = {}) {
    if (!config.endpoint) {
      throw new Error("HttpIntentExtractor requires an `endpoint`");
    }
    this.endpoint = normalizeEndpoint(config.endpoint);
    this.authHeader = buildAuthHeader(config);
    this.model = config.model;
    this.fetchImpl = deps.fetch ?? globalThis.fetch;
    this.timeoutMs = deps.timeoutMs ?? DEFAULT_EXTRACT_TIMEOUT_MS;
  }

  async extract(
    turns: ChatTurn[],
    serviceDescription?: AIServiceDescription,
  ): Promise<ExtractionResult> {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (this.authHeader) headers.set("Authorization", this.authHeader);

    const body: Record<string, unknown> = {
      conversation: turns.map((t) => ({ role: t.role, content: t.content })),
    };
    if (this.model) body.model = this.model;
    if (serviceDescription) body.ai_service_description = serviceDescription;

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.endpoint}${EXTRACT_PATH}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new Error(`intent extractor timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    }
    if (!res.ok) {
      // Surface the server's body (e.g. a 422 validation message, or the cause of
      // a 500) so failures are diagnosable instead of a bare status line.
      const detail = (await res.text().catch(() => "")).trim().slice(0, 300);
      throw new Error(
        `intent extractor returned ${res.status} ${res.statusText}${detail ? `: ${detail}` : ""}`,
      );
    }
    const payload = (await res.json()) as unknown;
    return normalizeResult(payload);
  }
}

/** Outcome of an extractor `/health` probe, surfaced by the Settings "Test" button. */
export interface ExtractorHealth {
  ok: boolean;
  /** HTTP status when a response came back (absent on a network/timeout failure). */
  status?: number;
  /** Short human-readable detail: the server's `status` field, the HTTP status text, or the error. */
  detail?: string;
}

/**
 * Probe an extractor endpoint's `GET /health` with the configured auth. Never
 * throws — a network error, timeout, or non-2xx all resolve to `{ ok: false }`
 * with a human-readable `detail`, so the UI can render the result directly.
 */
export async function checkExtractorHealth(
  config: ExtractorConfig,
  deps: HttpExtractorDeps = {},
): Promise<ExtractorHealth> {
  if (!config.endpoint) {
    return { ok: false, detail: "No endpoint configured" };
  }
  const endpoint = normalizeEndpoint(config.endpoint);
  const authHeader = buildAuthHeader(config);
  const headers = new Headers({ Accept: "application/json" });
  if (authHeader) headers.set("Authorization", authHeader);
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS;

  let res: Response;
  try {
    res = await fetchImpl(`${endpoint}/health`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return { ok: false, detail: `Timed out after ${timeoutMs}ms` };
    }
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
  if (!res.ok) {
    // 401/403 most often means the auth (or its scheme) is wrong — say so plainly.
    const hint = res.status === 401 || res.status === 403 ? " (check credentials)" : "";
    return { ok: false, status: res.status, detail: `${res.status} ${res.statusText}${hint}` };
  }
  const detail = await readHealthDetail(res);
  return { ok: true, status: res.status, detail };
}

/** Pull a short status string from a /health body; fall back to the HTTP status text. */
async function readHealthDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as unknown;
    if (
      body &&
      typeof body === "object" &&
      typeof (body as { status?: unknown }).status === "string"
    ) {
      return (body as { status: string }).status;
    }
  } catch {
    // non-JSON body — fall through to the status text
  }
  return res.statusText || "ok";
}

/** Trim trailing slashes so endpoint + path concatenation can't double up. */
function normalizeEndpoint(endpoint: string): string {
  return endpoint.replace(/\/+$/, "");
}

/**
 * Build the `Authorization` header value from the extractor config, or undefined
 * when no auth applies. Scheme defaults: `basic` when a username is set, else
 * `bearer` when an apiKey is set, else none — so a bare local sidecar (no creds)
 * sends no auth, and the common cases need no explicit `authScheme`.
 */
function buildAuthHeader(config: ExtractorConfig): string | undefined {
  const scheme =
    config.authScheme ?? (config.username ? "basic" : config.apiKey ? "bearer" : undefined);
  if (scheme === "basic") {
    const username = config.username ?? "";
    const password = config.apiKey ?? "";
    if (!username && !password) return undefined;
    const token = Buffer.from(`${username}:${password}`, "utf8").toString("base64");
    return `Basic ${token}`;
  }
  if (scheme === "bearer" && config.apiKey) {
    return `Bearer ${config.apiKey}`;
  }
  return undefined;
}

/**
 * Model-free fallback: treats each non-empty user turn as a candidate intent and
 * emits no claims. Deterministic and dependency-light — used for development,
 * tests, and when no extractor endpoint is configured.
 */
export class NaiveIntentExtractor implements IntentExtractor {
  async extract(turns: ChatTurn[]): Promise<ExtractionResult> {
    const intents: Intent[] = turns
      .filter((t) => t.role === "user")
      .map((t) => t.content.trim())
      .filter((c) => c.length > 0)
      .map((content) => ({ content }));
    return { claims: [], intents };
  }
}

/** Select the extractor implementation from the `analysis` config block. */
export function createExtractor(
  analysis: AnalysisConfig | undefined,
  deps: HttpExtractorDeps = {},
): IntentExtractor {
  const extractor = analysis?.extractor ?? {};
  const provider = extractor.provider ?? (extractor.endpoint ? "http" : "naive");
  if (provider === "naive") return new NaiveIntentExtractor();
  // "http" and "cloud" share the same HTTP client; cloud is just a remote endpoint.
  return new HttpIntentExtractor(extractor, deps);
}

function normalizeResult(payload: unknown): ExtractionResult {
  if (typeof payload !== "object" || payload === null) {
    return { claims: [], intents: [] };
  }
  // The orbitals contract wraps rows under `extractions`; older sidecars returned
  // them at the top level. Read the wrapper when present, else the payload itself.
  const root = payload as Record<string, unknown>;
  const wrapper = root.extractions;
  const obj = wrapper && typeof wrapper === "object" ? (wrapper as Record<string, unknown>) : root;
  return {
    claims: Array.isArray(obj.claims) ? obj.claims.map(normalizeClaim).filter(isPresent) : [],
    intents: Array.isArray(obj.intents) ? obj.intents.map(normalizeIntent).filter(isPresent) : [],
  };
}

function normalizeClaim(raw: unknown): Claim | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const obj = raw as Record<string, unknown>;
  const subtype = normalizeSubtype(obj.subtype);
  const content = obj.content;
  if (typeof content !== "string" || content.trim().length === 0) return undefined;
  if (!subtype) return undefined;
  const claim: Claim = { subtype, content };
  const evidences = normalizeEvidences(obj.evidences);
  if (evidences) claim.evidences = evidences;
  return claim;
}

/**
 * Map a raw subtype to a wire-contract value, tolerating the hosted endpoint's
 * Title Case ("Factoid", "User Assertion") alongside the sidecar's
 * lowercase_underscore form. Returns undefined for anything unrecognized.
 */
function normalizeSubtype(raw: unknown): ClaimSubtype | undefined {
  if (typeof raw !== "string") return undefined;
  const canonical = raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return CLAIM_SUBTYPES.includes(canonical as ClaimSubtype)
    ? (canonical as ClaimSubtype)
    : undefined;
}

function normalizeIntent(raw: unknown): Intent | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const obj = raw as Record<string, unknown>;
  const content = obj.content;
  if (typeof content !== "string" || content.trim().length === 0) return undefined;
  const intent: Intent = { content };
  const evidences = normalizeEvidences(obj.evidences);
  if (evidences) intent.evidences = evidences;
  return intent;
}

function normalizeEvidences(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const evidences = raw.filter((e): e is string => typeof e === "string" && e.length > 0);
  return evidences.length > 0 ? evidences : undefined;
}

function isPresent<T>(value: T | undefined): value is T {
  return value !== undefined;
}
