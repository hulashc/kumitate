/**
 * Reveal ordering.
 *
 * The gift reveal (PLAN.md Phase 2) assembles a build brick by brick before showing the letter.
 * This decides the order that happens in.
 *
 * The brief says "placement order", but a `Brick` carries no timestamp, and adding one would be
 * a wall clock from whichever client placed it — not comparable between people, and not stable
 * across an export/import round trip. Bottom-up is used instead: it is derivable from the build
 * itself, identical for everyone, and it looks *better*, because a build that assembles from the
 * ground up reads as being constructed rather than flickering into existence in whatever order
 * two people happened to click.
 */

import type { Brick } from "./grid";

/**
 * Bricks sorted into assembly order: lowest layer first, then front to back, then left to right.
 *
 * Totally ordered — the final `id` comparison means two bricks can never tie, so every client
 * animates the same sequence.
 */
export function revealOrder(bricks: readonly Brick[]): Brick[] {
  return [...bricks].sort(
    (a, b) => a.y - b.y || a.z - b.z || a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export type RevealTiming = {
  /** Seconds each brick takes to drop into place. */
  brickDuration: number;
  /** Seconds between successive bricks starting. */
  stagger: number;
  /** Total seconds for the whole assembly. */
  total: number;
};

/** Longest an assembly should run before it stops being charming. */
const MAX_ASSEMBLY_SECONDS = 12;

/**
 * Floor on the gap between bricks.
 *
 * Below roughly a frame's worth, several bricks start together each frame and the effect reads
 * as a rising wave rather than individual pieces — which is the right look at that scale, so the
 * floor is set low enough that a 2,000 brick build still fits the budget. A build large enough
 * to hit this floor will overrun `MAX_ASSEMBLY_SECONDS`; nothing that fits on a 32x32 baseplate
 * gets close.
 */
const MIN_STAGGER = 0.004;

const DEFAULT_STAGGER = 0.07;
const BRICK_DROP_SECONDS = 0.42;

/**
 * Pick a pace for `count` bricks.
 *
 * A ten-brick flower wants a leisurely stagger; a two-thousand-brick model has to hurry or the
 * recipient closes the tab. The stagger compresses until the whole thing fits the budget.
 */
export function revealTiming(count: number): RevealTiming {
  if (count <= 0) {
    return { brickDuration: BRICK_DROP_SECONDS, stagger: DEFAULT_STAGGER, total: 0 };
  }

  const stagger = Math.max(MIN_STAGGER, Math.min(DEFAULT_STAGGER, MAX_ASSEMBLY_SECONDS / count));
  return {
    brickDuration: BRICK_DROP_SECONDS,
    stagger,
    total: stagger * (count - 1) + BRICK_DROP_SECONDS,
  };
}

/**
 * How far through its own drop the brick at `index` is at time `elapsed`, from 0 (not started)
 * to 1 (landed).
 */
export function brickProgress(index: number, elapsed: number, timing: RevealTiming): number {
  const start = index * timing.stagger;
  if (elapsed <= start) return 0;
  if (elapsed >= start + timing.brickDuration) return 1;
  return (elapsed - start) / timing.brickDuration;
}

/** Number of bricks that have at least begun dropping by `elapsed`. */
export function visibleCount(elapsed: number, count: number, timing: RevealTiming): number {
  if (count <= 0) return 0;
  if (timing.stagger <= 0) return count;
  return Math.max(0, Math.min(count, Math.floor(elapsed / timing.stagger) + 1));
}

/** Ease-out cubic — fast in, settling gently, which reads as a brick being set down. */
export function easeOutCubic(t: number): number {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return 1 - Math.pow(1 - clamped, 3);
}
