import { describe, expect, it } from "vitest";
import { isConflictFree, resolveConflicts } from "./resolve";
import type { Placement, Rotation } from "./grid";
import { getPart, type Part } from "./parts";

function part(id: string): Part {
  const found = getPart(id);
  if (!found) throw new Error(`test fixture: part ${id} missing from catalogue`);
  return found;
}

const BRICK_2X4 = part("3001");
const BRICK_1X1 = part("3005");
const PLATE_2X2 = part("3022");

function at(p: Part, x: number, y: number, z: number, rot: Rotation = 0): Placement {
  return { part: p, x, y, z, rot };
}

/** Shuffle deterministically, so a failure is reproducible. */
function rotated<T>(items: readonly T[], by: number): T[] {
  const out = [...items];
  for (let i = 0; i < by % out.length; i++) out.push(out.shift()!);
  return out;
}

describe("resolveConflicts", () => {
  it("leaves a conflict-free build alone", () => {
    const bricks: [string, Placement][] = [
      ["a", at(BRICK_2X4, 0, 0, 0)],
      ["b", at(BRICK_2X4, 4, 0, 0)],
      ["c", at(BRICK_2X4, 0, 3, 0)],
    ];
    expect(resolveConflicts(bricks)).toEqual([]);
    expect(isConflictFree(bricks)).toBe(true);
  });

  it("keeps the lower id when two bricks overlap exactly", () => {
    const losers = resolveConflicts([
      ["bbb", at(BRICK_2X4, 0, 0, 0)],
      ["aaa", at(BRICK_2X4, 0, 0, 0)],
    ]);
    expect(losers).toEqual([{ id: "bbb", blockedBy: "aaa" }]);
  });

  it("resolves a partial overlap", () => {
    const losers = resolveConflicts([
      ["aaa", at(BRICK_2X4, 0, 0, 0)],
      ["bbb", at(BRICK_2X4, 1, 0, 1)],
    ]);
    expect(losers.map((l) => l.id)).toEqual(["bbb"]);
  });

  it("gives the same answer whatever order the bricks arrive in", () => {
    const bricks: [string, Placement][] = [
      ["d", at(BRICK_2X4, 0, 0, 0)],
      ["a", at(BRICK_2X4, 1, 0, 1)],
      ["c", at(BRICK_1X1, 0, 0, 0)],
      ["b", at(PLATE_2X2, 6, 0, 6)],
    ];

    const expected = resolveConflicts(bricks);
    for (let i = 1; i < bricks.length; i++) {
      expect(resolveConflicts(rotated(bricks, i))).toEqual(expected);
    }
    // Reversed too, for good measure.
    expect(resolveConflicts([...bricks].reverse())).toEqual(expected);
  });

  it("is idempotent — the survivors are already conflict-free", () => {
    const bricks: [string, Placement][] = [
      ["a", at(BRICK_2X4, 0, 0, 0)],
      ["b", at(BRICK_2X4, 0, 0, 0)],
      ["c", at(BRICK_2X4, 1, 0, 0)],
      ["d", at(BRICK_1X1, 1, 1, 2)],
    ];

    const losers = new Set(resolveConflicts(bricks).map((l) => l.id));
    const survivors = bricks.filter(([id]) => !losers.has(id));

    expect(resolveConflicts(survivors)).toEqual([]);
    expect(isConflictFree(survivors)).toBe(true);
  });

  it("drops every loser in a pile-up, keeping exactly one", () => {
    const bricks: [string, Placement][] = [
      ["e", at(BRICK_2X4, 0, 0, 0)],
      ["b", at(BRICK_2X4, 0, 0, 0)],
      ["d", at(BRICK_2X4, 0, 0, 0)],
      ["a", at(BRICK_2X4, 0, 0, 0)],
      ["c", at(BRICK_2X4, 0, 0, 0)],
    ];
    const losers = resolveConflicts(bricks);
    expect(losers.map((l) => l.id).sort()).toEqual(["b", "c", "d", "e"]);
    expect(losers.every((l) => l.blockedBy === "a")).toBe(true);
  });

  it("does not cascade — a brick only loses to a survivor", () => {
    // "b" overlaps "a" and loses. "c" overlaps only "b", so with "b" gone it must survive.
    const bricks: [string, Placement][] = [
      ["a", at(BRICK_1X1, 0, 0, 0)],
      ["b", at(BRICK_2X4, 0, 0, 0)], // spans x 0-1, z 0-3 — hits "a"
      ["c", at(BRICK_1X1, 1, 0, 3)], // inside b's footprint, clear of a
    ];
    const losers = resolveConflicts(bricks);
    expect(losers.map((l) => l.id)).toEqual(["b"]);
    expect(losers[0]?.blockedBy).toBe("a");
  });

  it("treats stacked bricks as no conflict", () => {
    expect(
      resolveConflicts([
        ["a", at(BRICK_2X4, 0, 0, 0)],
        ["b", at(BRICK_2X4, 0, 3, 0)],
      ]),
    ).toEqual([]);
  });

  it("catches an overlap that only exists because of rotation", () => {
    const losers = resolveConflicts([
      ["aaa", at(BRICK_2X4, 4, 0, 4)], // x 4-5, z 4-7
      ["bbb", at(BRICK_2X4, 4, 0, 4, 1)], // x 4-7, z 4-5
    ]);
    expect(losers.map((l) => l.id)).toEqual(["bbb"]);
  });

  it("handles an empty build", () => {
    expect(resolveConflicts([])).toEqual([]);
    expect(isConflictFree([])).toBe(true);
  });

  it("handles a single brick", () => {
    expect(resolveConflicts([["a", at(BRICK_2X4, 0, 0, 0)]])).toEqual([]);
  });
});
