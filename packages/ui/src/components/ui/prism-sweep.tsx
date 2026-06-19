"use client";

import type { CSSProperties } from "react";
import {
  type DotAnimationResolver,
  DotMatrixBase,
  type DotMatrixCommonProps,
  MATRIX_SIZE,
} from "@/lib/dotmatrix-core";
import { useDotMatrixPhases, usePrefersReducedMotion } from "@/lib/dotmatrix-hooks";

// Longest anti-diagonal index (row+col) on the grid — used to normalize the sweep.
const DIAGONAL_SPAN = (MATRIX_SIZE - 1) * 2;

/**
 * "Prism Sweep": a diagonal wave (`dmx-diagonal-alt-sweep`) rendered with the
 * `grad-prism` gradient. Each dot's sweep delay comes from its anti-diagonal
 * position, with alternating diagonals offset half a cycle for the interleaved
 * sweep. A lively, clearly-animated loader (not a blank spinner).
 */
const animationResolver: DotAnimationResolver = ({ isActive, row, col, reducedMotion, phase }) => {
  if (!isActive) return { className: "dmx-inactive" };
  const diagonal = row + col;
  const style = {
    "--dmx-path": diagonal / DIAGONAL_SPAN,
    "--dmx-diagonal-parity": diagonal % 2,
  } as CSSProperties;
  if (reducedMotion || phase === "idle") {
    return { style: { ...style, opacity: 0.2 + (diagonal / DIAGONAL_SPAN) * 0.7 } };
  }
  return { className: "dmx-diagonal-alt-sweep", style };
};

export function PrismSweep({
  speed = 1.2,
  pattern = "full",
  animated = true,
  ...rest
}: DotMatrixCommonProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { phase, onMouseEnter, onMouseLeave } = useDotMatrixPhases({
    animated: Boolean(animated && !reducedMotion),
    speed,
  });

  return (
    <DotMatrixBase
      {...rest}
      ariaLabel={rest.ariaLabel ?? "Loading"}
      size={rest.size ?? 40}
      dotSize={rest.dotSize ?? 5}
      speed={speed}
      pattern={pattern}
      colorPreset={rest.colorPreset ?? "grad-prism"}
      animated={animated}
      phase={phase}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      reducedMotion={reducedMotion}
      animationResolver={animationResolver}
    />
  );
}
