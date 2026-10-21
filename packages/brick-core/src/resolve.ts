/**
 * Deterministic post-merge collision resolution.
 *
 * Phase 1 checked collisions only at placement time, on one client, against what that client had
 * seen. Two people placing overlapping bricks in the same instant therefore both succeeded — the
 * soft-start limitation recorded in PLAN.md section 6. This module closes that gap.
 *
 * The CRDT merges the overlap without complaint; it is our job to pick a winner. The rule has to
 * be a **pure function of the merged document**, because every client runs it independently with
 * no coordination and they all have to reach the same answer. Anything that depends on local
 * state — arrival order, wall-clock time, who happens to be running the resolver — would let two
 * clients delete different bricks and never converge.
 *
 * The rule: sort by brick id, replay into a fresh occupancy index, and drop anything that cannot
 * fit. Lowest id wins.
 *
 * Why id order rather than "oldest wins": a genuine conflict here is by definition *concurrent*,
 * since any non-concurrent overlap was already refused at placement time. There is no meaningful
 * "older" between two simultaneous placements, so an arbitrary-but-stable tiebreak is the honest
 * choice. nanoid ids give exactly that.
 */

import { Occupancy } from "./collision";
import type { Placement } from "./grid";

export type ConflictLoser = {
  /** Brick to remove. */
  id: string;
  /** Brick that displaced it — always the surviving one. */
  blockedBy: string;
};

/**
 * Work out which bricks must be removed so that nothing overlaps.
 *
 * Pure, deterministic and idempotent: feeding the surviving set back in returns an empty list.
 * The input may be given in any order.
 */
export function resolveConflicts(bricks: Iterable<readonly [string, Placement]>): ConflictLoser[] {
  // Sorting is what makes the result independent of how the caller enumerated the document.
  const ordered = [...bricks].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const survivors = new Occupancy();
  const losers: ConflictLoser[] = [];

  for (const [id, placement] of ordered) {
    const blockedBy = survivors.firstCollision(placement, id);
    if (blockedBy === undefined) {
      survivors.add(id, placement);
    } else {
      losers.push({ id, blockedBy });
    }
  }

  return losers;
}

/** True if no two bricks overlap. */
export function isConflictFree(bricks: Iterable<readonly [string, Placement]>): boolean {
  return resolveConflicts(bricks).length === 0;
}
