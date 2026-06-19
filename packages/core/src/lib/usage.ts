import { sortJsonValue } from "../json.js";

export interface UsageEstimatorOptions {
  bytesPerToken?: number;
  fallbackTokensPerTool?: number;
}

export interface ToolTokenEstimate {
  toolCount: number;
  estimatedTokens: number;
}

export const DEFAULT_BYTES_PER_TOKEN = 4;
export const DEFAULT_FALLBACK_TOKENS_PER_TOOL = 130;

export function estimateToolPayloadTokens(
  tools: readonly unknown[],
  opts: UsageEstimatorOptions = {},
): ToolTokenEstimate {
  const toolCount = tools.length;
  if (toolCount === 0) return { toolCount, estimatedTokens: 0 };

  const bytesPerToken = positiveNumber(opts.bytesPerToken) ?? DEFAULT_BYTES_PER_TOKEN;
  const payload = stableStringify(tools);
  const estimatedTokens = Math.ceil(Buffer.byteLength(payload, "utf8") / bytesPerToken);
  return { toolCount, estimatedTokens };
}

export function estimateToolCountTokens(
  toolCount: number,
  opts: UsageEstimatorOptions = {},
): ToolTokenEstimate {
  const count = Math.max(0, Math.floor(Number.isFinite(toolCount) ? toolCount : 0));
  const fallbackTokensPerTool =
    positiveNumber(opts.fallbackTokensPerTool) ?? DEFAULT_FALLBACK_TOKENS_PER_TOOL;
  return {
    toolCount: count,
    estimatedTokens: count * fallbackTokensPerTool,
  };
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}
