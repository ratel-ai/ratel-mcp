import { cn } from "@/lib/utils";

// Claude / Codex ship their own full-colour marks; the Ratel badge is the brand
// badger (a cream silhouette) on a brand-green chip so it reads in either theme.
const CLAUDE_ICON_SRC = new URL("../assets/claudecode-color.svg", import.meta.url).href;
const CODEX_ICON_SRC = new URL("../assets/codex-color.svg", import.meta.url).href;
const RATEL_BADGER_SRC = new URL("../assets/ratel-badger.svg", import.meta.url).href;

/** Where a skill comes from / is hosted: an agent's folder, or Ratel itself. */
export type SkillSource = "claude" | "codex" | "ratel";

const LABELS: Record<SkillSource, string> = {
  claude: "Claude Code",
  codex: "Codex",
  ratel: "Ratel",
};

export function sourceLabel(source: SkillSource): string {
  return LABELS[source];
}

/** A small badge showing which platform a skill belongs to. */
export function SourceIcon({ source, className }: { source: SkillSource; className?: string }) {
  const label = LABELS[source];

  if (source === "ratel") {
    return (
      <span
        aria-label={label}
        className={cn(
          "grid size-6 shrink-0 place-items-center overflow-hidden rounded-md bg-brand-green",
          className,
        )}
        role="img"
        title={label}
      >
        <img alt="" aria-hidden="true" className="w-4" src={RATEL_BADGER_SRC} />
      </span>
    );
  }

  return (
    <span
      aria-label={label}
      className={cn(
        "grid size-6 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-background",
        className,
      )}
      role="img"
      title={label}
    >
      <img
        alt=""
        aria-hidden="true"
        className="size-4"
        src={source === "claude" ? CLAUDE_ICON_SRC : CODEX_ICON_SRC}
      />
    </span>
  );
}
