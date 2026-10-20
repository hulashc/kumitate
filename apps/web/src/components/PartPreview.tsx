"use client";

import { rotatedFootprint, type Part } from "@kumitate/brick-core";

/**
 * A small top-down SVG of a part: its footprint, plus a dot per stud.
 *
 * Deliberately 2D. Sixteen live 3D previews would cost sixteen extra render targets to say
 * something a footprint diagram says more legibly at 32 pixels.
 */
export function PartPreview({
  part,
  color,
  size = 34,
}: {
  part: Part;
  color: string;
  size?: number;
}) {
  const { width, depth } = rotatedFootprint(part, 0);
  const cell = size / Math.max(width, depth, 2);
  const w = width * cell;
  const d = depth * cell;
  const offsetX = (size - w) / 2;
  const offsetY = (size - d) / 2;

  const studs: { cx: number; cy: number }[] = [];
  if (part.studs !== "none") {
    const rows = part.studs === "high-edge" ? 1 : depth;
    for (let z = 0; z < rows; z++) {
      for (let x = 0; x < width; x++) {
        studs.push({ cx: offsetX + (x + 0.5) * cell, cy: offsetY + (z + 0.5) * cell });
      }
    }
  }

  const rounded = part.shape === "cylinder";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {rounded ? (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={Math.min(w, d) / 2 - 0.5}
          fill={color}
          stroke="rgba(0,0,0,0.35)"
          strokeWidth={1}
        />
      ) : (
        <rect
          x={offsetX}
          y={offsetY}
          width={w}
          height={d}
          rx={2}
          fill={color}
          stroke="rgba(0,0,0,0.35)"
          strokeWidth={1}
        />
      )}

      {/* The slope's fall line, so it is distinguishable from a plain 2x2 at a glance. */}
      {part.shape === "slope" && (
        <line
          x1={offsetX}
          y1={offsetY + cell}
          x2={offsetX + w}
          y2={offsetY + cell}
          stroke="rgba(0,0,0,0.45)"
          strokeWidth={1.5}
        />
      )}

      {studs.map((s, i) => (
        <circle
          key={i}
          cx={s.cx}
          cy={s.cy}
          r={cell * 0.26}
          fill="rgba(255,255,255,0.5)"
          stroke="rgba(0,0,0,0.25)"
          strokeWidth={0.6}
        />
      ))}
    </svg>
  );
}
