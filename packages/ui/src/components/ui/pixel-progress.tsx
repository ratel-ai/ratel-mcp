import { cn } from "@/lib/utils";

const CELLS = 28;
const CELL_KEYS = Array.from({ length: CELLS }, (_, i) => `cell-${i}`);

/** A blocky, pixel-art progress bar: discrete cells light up as `progress` (0–100) climbs. */
export function PixelProgress({ progress, className }: { progress: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, progress));
  const filled = Math.round((clamped / 100) * CELLS);
  return (
    <div
      aria-label={`Loading ${Math.round(clamped)}%`}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={Math.round(clamped)}
      className={cn("flex gap-px", className)}
      role="progressbar"
    >
      {CELL_KEYS.map((key, i) => (
        <span
          className={cn(
            "h-3.5 flex-1 rounded-[1px] transition-colors duration-150",
            i < filled ? "bg-brand-green" : "bg-muted",
          )}
          key={key}
        />
      ))}
    </div>
  );
}
