import { beforeEach, describe, expect, it } from "vitest";
import { Occupancy, canPlace } from "./collision.js";
import { BASEPLATE_SIZE, type Placement, type Rotation } from "./grid.js";
import { getPart, type Part } from "./parts.js";

function part(id: string): Part {
  const found = getPart(id);
  if (!found) throw new Error(`test fixture: part ${id} missing from catalogue`);
  return found;
}

const BRICK_2X4 = part("3001"); // 2 x 4, 3 plates
const BRICK_1X1 = part("3005"); // 1 x 1, 3 plates
const PLATE_2X2 = part("3022"); // 2 x 2, 1 plate
const PLATE_1X1 = part("3024"); // 1 x 1, 1 plate

function at(p: Part, x: number, y: number, z: number, rot: Rotation = 0): Placement {
  return { part: p, x, y, z, rot };
}

describe("Occupancy indexing", () => {
  let occ: Occupancy;

  beforeEach(() => {
    occ = new Occupancy();
  });

  it("starts empty", () => {
    expect(occ.size).toBe(0);
    expect(occ.at(0, 0, 0)).toBeUndefined();
    expect(occ.columnTop(0, 0)).toBe(0);
  });

  it("records every cell of an added brick", () => {
    occ.add("a", at(BRICK_2X4, 2, 0, 3));
    expect(occ.size).toBe(1);
    expect(occ.at(2, 0, 3)).toBe("a");
    expect(occ.at(3, 2, 6)).toBe("a");
    expect(occ.at(4, 0, 3)).toBeUndefined(); // outside width
    expect(occ.at(2, 3, 3)).toBeUndefined(); // above the top plate
  });

  it("frees every cell on removal", () => {
    occ.add("a", at(BRICK_2X4, 0, 0, 0));
    expect(occ.remove("a")).toBe(true);
    expect(occ.size).toBe(0);
    expect(occ.at(0, 0, 0)).toBeUndefined();
    expect(occ.columnTop(0, 0)).toBe(0);
    expect(occ.remove("a")).toBe(false);
  });

  it("treats re-adding an id as a move", () => {
    occ.add("a", at(BRICK_1X1, 0, 0, 0));
    occ.add("a", at(BRICK_1X1, 5, 0, 5));
    expect(occ.size).toBe(1);
    expect(occ.at(0, 0, 0)).toBeUndefined();
    expect(occ.at(5, 0, 5)).toBe("a");
  });

  it("clears everything", () => {
    occ.add("a", at(BRICK_1X1, 0, 0, 0));
    occ.add("b", at(BRICK_1X1, 1, 0, 0));
    occ.clear();
    expect(occ.size).toBe(0);
    expect(occ.at(1, 0, 0)).toBeUndefined();
  });

  it("builds from an iterable of placements", () => {
    const built = Occupancy.from([
      ["a", at(BRICK_1X1, 0, 0, 0)],
      ["b", at(BRICK_1X1, 1, 0, 0)],
    ]);
    expect(built.size).toBe(2);
    expect([...built.ids()].sort()).toEqual(["a", "b"]);
  });
});

describe("collision detection", () => {
  let occ: Occupancy;

  beforeEach(() => {
    occ = new Occupancy();
    occ.add("base", at(BRICK_2X4, 4, 0, 4)); // covers x 4-5, z 4-7, y 0-2
  });

  it("finds an exact overlap", () => {
    expect(occ.collides(at(BRICK_2X4, 4, 0, 4))).toBe(true);
    expect(occ.firstCollision(at(BRICK_2X4, 4, 0, 4))).toBe("base");
  });

  it("finds a partial overlap", () => {
    expect(occ.collides(at(BRICK_2X4, 5, 0, 5))).toBe(true);
    expect(occ.collides(at(BRICK_1X1, 5, 2, 7))).toBe(true);
  });

  it("allows a brick flush alongside", () => {
    expect(occ.collides(at(BRICK_2X4, 6, 0, 4))).toBe(false); // next column over
    expect(occ.collides(at(BRICK_2X4, 4, 0, 8))).toBe(false); // just beyond the far end
  });

  it("allows a brick stacked exactly on top", () => {
    expect(occ.collides(at(BRICK_2X4, 4, 3, 4))).toBe(false);
  });

  it("catches a brick sunk one plate into the one below", () => {
    expect(occ.collides(at(BRICK_2X4, 4, 2, 4))).toBe(true);
  });

  it("ignores the brick being moved", () => {
    expect(occ.collides(at(BRICK_2X4, 4, 0, 4), "base")).toBe(false);
    expect(occ.firstCollision(at(BRICK_2X4, 4, 0, 4), "base")).toBeUndefined();
  });

  it("detects overlap created by rotation", () => {
    // Turned 90 degrees about its own corner the 2x4 sweeps across x 4-7, z 4-5.
    occ.add("side", at(BRICK_1X1, 7, 0, 5));
    expect(occ.collides(at(BRICK_2X4, 4, 0, 4, 1), "base")).toBe(true);
  });
});

describe("resting height", () => {
  let occ: Occupancy;

  beforeEach(() => {
    occ = new Occupancy();
  });

  it("rests on the baseplate when nothing is below", () => {
    expect(occ.restingY(at(BRICK_2X4, 0, 0, 0))).toBe(0);
  });

  it("rests on top of a single brick", () => {
    occ.add("a", at(BRICK_2X4, 0, 0, 0));
    expect(occ.restingY(at(PLATE_2X2, 0, 0, 0))).toBe(3);
  });

  it("stacks plates one plate at a time", () => {
    occ.add("p1", at(PLATE_2X2, 0, 0, 0));
    expect(occ.restingY(at(PLATE_2X2, 0, 0, 0))).toBe(1);
    occ.add("p2", at(PLATE_2X2, 0, 1, 0));
    expect(occ.restingY(at(PLATE_2X2, 0, 0, 0))).toBe(2);
    occ.add("p3", at(PLATE_2X2, 0, 2, 0));
    // Three plates make exactly one brick height.
    expect(occ.restingY(at(PLATE_2X2, 0, 0, 0))).toBe(3);
  });

  it("lands on the highest column under the footprint", () => {
    occ.add("tall", at(BRICK_1X1, 0, 0, 0)); // top at plate 3
    occ.add("short", at(PLATE_1X1, 1, 0, 0)); // top at plate 1
    // A 1x2 spanning both columns must clear the taller one.
    expect(occ.restingY(at(PLATE_2X2, 0, 0, 0))).toBe(3);
  });

  it("ignores the brick being moved when computing its own landing", () => {
    occ.add("a", at(BRICK_2X4, 0, 0, 0));
    expect(occ.restingY(at(BRICK_2X4, 0, 0, 0), "a")).toBe(0);
  });

  it("drops a placement to its resting level", () => {
    occ.add("a", at(BRICK_2X4, 0, 0, 0));
    const dropped = occ.drop(at(PLATE_2X2, 0, 99, 0));
    expect(dropped.y).toBe(3);
    expect(dropped.x).toBe(0);
  });

  it("reports the column top correctly after a removal", () => {
    occ.add("a", at(BRICK_1X1, 0, 0, 0));
    occ.add("b", at(BRICK_1X1, 0, 3, 0));
    expect(occ.columnTop(0, 0)).toBe(6);
    occ.remove("b");
    expect(occ.columnTop(0, 0)).toBe(3);
    occ.remove("a");
    expect(occ.columnTop(0, 0)).toBe(0);
  });

  it("a dropped brick never collides with what it landed on", () => {
    occ.add("a", at(BRICK_2X4, 0, 0, 0));
    occ.add("b", at(PLATE_1X1, 1, 3, 1));
    const dropped = occ.drop(at(BRICK_2X4, 0, 0, 0));
    expect(occ.collides(dropped)).toBe(false);
  });
});

describe("canPlace", () => {
  let occ: Occupancy;

  beforeEach(() => {
    occ = new Occupancy();
  });

  it("accepts a legal placement", () => {
    expect(canPlace(at(BRICK_2X4, 0, 0, 0), occ)).toEqual({ ok: true });
  });

  it("rejects an overlap and names the blocker", () => {
    occ.add("a", at(BRICK_2X4, 0, 0, 0));
    const result = canPlace(at(BRICK_2X4, 0, 0, 0), occ);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("collision");
      expect(result.blockedBy).toBe("a");
    }
  });

  it("rejects a brick hanging off the plate", () => {
    const result = canPlace(at(BRICK_2X4, BASEPLATE_SIZE - 1, 0, 0), occ);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("out-of-bounds");
  });

  it("rejects a negative plate level", () => {
    const result = canPlace(at(BRICK_2X4, 0, -1, 0), occ);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("below-baseplate");
  });

  it("can skip the bounds check for an unbounded scene", () => {
    const result = canPlace(at(BRICK_2X4, 9999, 0, 9999), occ, { baseplateSize: Infinity });
    expect(result).toEqual({ ok: true });
  });

  it("honours ignoreId so a brick can be re-placed where it already is", () => {
    occ.add("a", at(BRICK_2X4, 0, 0, 0));
    expect(canPlace(at(BRICK_2X4, 0, 0, 0), occ, { ignoreId: "a" })).toEqual({ ok: true });
  });
});

describe("index integrity under overlapping writes", () => {
  it("keeps the surviving brick's cells after an overlapping add is removed", () => {
    const occ = new Occupancy();
    occ.add("a", at(BRICK_2X4, 0, 0, 0));
    // Deliberately index an overlapping brick, as a Phase 2 merge resolver might have to.
    occ.add("b", at(BRICK_2X4, 0, 0, 0));
    expect(occ.at(0, 0, 0)).toBe("b");

    occ.remove("b");
    // "a" is still indexed and must not have been collaterally erased from the column index.
    expect(occ.size).toBe(1);
    expect(occ.columnTop(0, 0)).toBe(3);
  });
});
