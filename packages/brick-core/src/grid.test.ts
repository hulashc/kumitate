import { describe, expect, it } from "vitest";
import {
  BASEPLATE_SIZE,
  type Rotation,
  ROTATIONS,
  centerOnCell,
  clampToBaseplate,
  footprintCells,
  isWithinBaseplate,
  nextRotation,
  occupiedCells,
  prevRotation,
  rotateCell,
  rotatedFootprint,
  studCells,
  topOf,
} from "./grid.js";
import { getPart, localStudCells, type Part } from "./parts.js";
import { LDU_PER_BRICK, PLATES_PER_BRICK, platesToScene, studsToScene } from "./units.js";

/** Catalogue lookup that fails the test rather than returning undefined. */
function part(id: string): Part {
  const found = getPart(id);
  if (!found) throw new Error(`test fixture: part ${id} missing from catalogue`);
  return found;
}

const BRICK_2X4 = part("3001"); // width 2, depth 4, height 3
const BRICK_1X1 = part("3005");
const PLATE_2X2 = part("3022");
const SLOPE_2X2 = part("3039");
const TILE_2X2 = part("3068b");

describe("units", () => {
  it("defines a brick as three plates, 24 LDU", () => {
    expect(PLATES_PER_BRICK).toBe(3);
    expect(LDU_PER_BRICK).toBe(24);
  });

  it("scales one stud to exactly one scene unit", () => {
    expect(studsToScene(1)).toBe(1);
    expect(studsToScene(4)).toBe(4);
  });

  it("scales a plate to 0.4 scene units and a brick to 1.2", () => {
    expect(platesToScene(1)).toBeCloseTo(0.4, 10);
    expect(platesToScene(PLATES_PER_BRICK)).toBeCloseTo(1.2, 10);
  });
});

describe("rotation", () => {
  it("cycles forward and back through four quarter turns", () => {
    expect(nextRotation(0)).toBe(1);
    expect(nextRotation(3)).toBe(0);
    expect(prevRotation(0)).toBe(3);
    expect(prevRotation(1)).toBe(0);
  });

  it("swaps the footprint axes on odd quarter turns only", () => {
    expect(rotatedFootprint(BRICK_2X4, 0)).toEqual({ width: 2, depth: 4 });
    expect(rotatedFootprint(BRICK_2X4, 1)).toEqual({ width: 4, depth: 2 });
    expect(rotatedFootprint(BRICK_2X4, 2)).toEqual({ width: 2, depth: 4 });
    expect(rotatedFootprint(BRICK_2X4, 3)).toEqual({ width: 4, depth: 2 });
  });

  it("keeps rotated cells inside the rotated footprint for every part and rotation", () => {
    for (const p of [BRICK_2X4, BRICK_1X1, PLATE_2X2, SLOPE_2X2]) {
      for (const rot of ROTATIONS) {
        const { width, depth } = rotatedFootprint(p, rot);
        for (let lz = 0; lz < p.depth; lz++) {
          for (let lx = 0; lx < p.width; lx++) {
            const [x, z] = rotateCell(p, rot, lx, lz);
            expect(x, `part ${p.id} rot ${rot} cell ${lx},${lz}`).toBeGreaterThanOrEqual(0);
            expect(z).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThan(width);
            expect(z).toBeLessThan(depth);
          }
        }
      }
    }
  });

  it("is a bijection — no two local cells collapse onto the same rotated cell", () => {
    for (const rot of ROTATIONS) {
      const seen = new Set<string>();
      for (let lz = 0; lz < BRICK_2X4.depth; lz++) {
        for (let lx = 0; lx < BRICK_2X4.width; lx++) {
          seen.add(rotateCell(BRICK_2X4, rot, lx, lz).join(","));
        }
      }
      expect(seen.size).toBe(BRICK_2X4.width * BRICK_2X4.depth);
    }
  });

  it("treats rotation 0 as the identity", () => {
    for (let lz = 0; lz < BRICK_2X4.depth; lz++) {
      for (let lx = 0; lx < BRICK_2X4.width; lx++) {
        expect(rotateCell(BRICK_2X4, 0, lx, lz)).toEqual([lx, lz]);
      }
    }
  });

  it("returns to the start after four quarter turns of a square part", () => {
    // Only square parts can be re-fed through rotateCell, since the footprint axes do not swap.
    for (let lz = 0; lz < PLATE_2X2.depth; lz++) {
      for (let lx = 0; lx < PLATE_2X2.width; lx++) {
        let cell: readonly [number, number] = [lx, lz];
        for (let i = 0; i < 4; i++) cell = rotateCell(PLATE_2X2, 1, cell[0], cell[1]);
        expect(cell).toEqual([lx, lz]);
      }
    }
  });

  it("is its own inverse at 180 degrees", () => {
    for (let lz = 0; lz < PLATE_2X2.depth; lz++) {
      for (let lx = 0; lx < PLATE_2X2.width; lx++) {
        const once = rotateCell(PLATE_2X2, 2, lx, lz);
        expect(rotateCell(PLATE_2X2, 2, once[0], once[1])).toEqual([lx, lz]);
      }
    }
  });
});

describe("footprint and volume", () => {
  it("covers width x depth columns", () => {
    const cells = footprintCells({ part: BRICK_2X4, x: 5, y: 0, z: 7, rot: 0 });
    expect(cells).toHaveLength(8);
    expect(cells).toContainEqual([5, 7]);
    expect(cells).toContainEqual([6, 10]);
    expect(cells).not.toContainEqual([7, 7]);
  });

  it("covers the rotated columns after a quarter turn", () => {
    const cells = footprintCells({ part: BRICK_2X4, x: 5, y: 0, z: 7, rot: 1 });
    expect(cells).toHaveLength(8);
    expect(cells).toContainEqual([8, 8]);
    expect(cells).not.toContainEqual([5, 10]);
  });

  it("fills height-in-plates cells per column", () => {
    const cells = occupiedCells({ part: BRICK_2X4, x: 0, y: 0, z: 0, rot: 0 });
    expect(cells).toHaveLength(8 * 3);
    expect(cells).toContainEqual([0, 0, 0]);
    expect(cells).toContainEqual([0, 2, 0]);
    expect(cells).not.toContainEqual([0, 3, 0]);
  });

  it("offsets the volume by y", () => {
    const cells = occupiedCells({ part: PLATE_2X2, x: 0, y: 6, z: 0, rot: 0 });
    expect(cells.every(([, y]) => y === 6)).toBe(true);
  });

  it("reports the exclusive top plate level", () => {
    expect(topOf({ part: BRICK_2X4, x: 0, y: 0, z: 0, rot: 0 })).toBe(3);
    expect(topOf({ part: PLATE_2X2, x: 0, y: 3, z: 0, rot: 0 })).toBe(4);
  });
});

describe("studs", () => {
  it("puts a stud on every column of a plain brick", () => {
    const studs = studCells({ part: BRICK_2X4, x: 0, y: 0, z: 0, rot: 0 });
    expect(studs).toHaveLength(8);
    expect(studs.every((s) => s.y === 3)).toBe(true);
  });

  it("gives tiles no studs", () => {
    expect(studCells({ part: TILE_2X2, x: 0, y: 0, z: 0, rot: 0 })).toHaveLength(0);
    expect(localStudCells(TILE_2X2)).toHaveLength(0);
  });

  it("puts slope studs only on the high edge", () => {
    const studs = studCells({ part: SLOPE_2X2, x: 0, y: 0, z: 0, rot: 0 });
    expect(studs).toHaveLength(2);
    expect(studs.every((s) => s.z === 0)).toBe(true);
  });

  it("moves the slope's high edge when rotated", () => {
    const studs = studCells({ part: SLOPE_2X2, x: 0, y: 0, z: 0, rot: 1 });
    expect(studs).toHaveLength(2);
    // After one clockwise turn the high edge runs along the far x column.
    expect(studs.every((s) => s.x === 1)).toBe(true);
  });

  it("keeps studs within the footprint at every rotation", () => {
    for (const rot of ROTATIONS) {
      const placement = { part: BRICK_2X4, x: 0, y: 0, z: 0, rot };
      const { width, depth } = rotatedFootprint(BRICK_2X4, rot);
      for (const stud of studCells(placement)) {
        expect(stud.x).toBeGreaterThanOrEqual(0);
        expect(stud.x).toBeLessThan(width);
        expect(stud.z).toBeGreaterThanOrEqual(0);
        expect(stud.z).toBeLessThan(depth);
      }
    }
  });
});

describe("baseplate bounds", () => {
  it("accepts a brick fully on the plate", () => {
    expect(isWithinBaseplate({ part: BRICK_2X4, x: 0, y: 0, z: 0, rot: 0 })).toBe(true);
    expect(isWithinBaseplate({ part: BRICK_2X4, x: 30, y: 0, z: 28, rot: 0 })).toBe(true);
  });

  it("rejects a brick hanging off any edge", () => {
    expect(isWithinBaseplate({ part: BRICK_2X4, x: 31, y: 0, z: 0, rot: 0 })).toBe(false);
    expect(isWithinBaseplate({ part: BRICK_2X4, x: 0, y: 0, z: 29, rot: 0 })).toBe(false);
    expect(isWithinBaseplate({ part: BRICK_1X1, x: -1, y: 0, z: 0, rot: 0 })).toBe(false);
  });

  it("accounts for rotation when checking the edge", () => {
    // 2x4 laid along z fits at z=28; turned to run along x it does not fit at x=29.
    expect(isWithinBaseplate({ part: BRICK_2X4, x: 29, y: 0, z: 0, rot: 1 })).toBe(false);
    expect(isWithinBaseplate({ part: BRICK_2X4, x: 28, y: 0, z: 0, rot: 1 })).toBe(true);
  });

  it("slides an overhanging brick back onto the plate", () => {
    const clamped = clampToBaseplate({ part: BRICK_2X4, x: 40, y: 0, z: -3, rot: 0 });
    expect(clamped.x).toBe(BASEPLATE_SIZE - 2);
    expect(clamped.z).toBe(0);
    expect(isWithinBaseplate(clamped)).toBe(true);
  });

  it("leaves an in-bounds brick untouched", () => {
    const original = { part: BRICK_2X4, x: 4, y: 3, z: 9, rot: 2 as Rotation };
    expect(clampToBaseplate(original)).toEqual(original);
  });
});

describe("centring on the cursor", () => {
  it("puts a 1x1 exactly on the pointed cell", () => {
    const placed = centerOnCell(BRICK_1X1, 0, 10, 12);
    expect([placed.x, placed.z]).toEqual([10, 12]);
  });

  it("straddles the pointed cell for a 2x4", () => {
    const placed = centerOnCell(BRICK_2X4, 0, 10, 12);
    expect([placed.x, placed.z]).toEqual([10, 11]);
    const cells = footprintCells(placed);
    expect(cells).toContainEqual([10, 12]);
  });

  it("still covers the pointed cell after rotation", () => {
    for (const rot of ROTATIONS) {
      const placed = centerOnCell(BRICK_2X4, rot, 16, 16);
      expect(footprintCells(placed)).toContainEqual([16, 16]);
    }
  });
});
