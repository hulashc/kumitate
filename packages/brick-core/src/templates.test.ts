import { describe, expect, it } from "vitest";
import {
  TEMPLATES,
  getTemplate,
  placeTemplate,
  templateFootprint,
  type Template,
} from "./templates";
import { getPart } from "./parts";
import { getColor } from "./colors";
import { isConflictFree } from "./resolve";
import { BASEPLATE_SIZE, isWithinBaseplate, type Placement } from "./grid";

/** Templates as placements, which is what the collision and bounds helpers want. */
function asPlacements(template: Template, x = 0, y = 0, z = 0): [string, Placement][] {
  return placeTemplate(template, x, y, z).map((b, i) => [
    `${template.id}-${i}`,
    { part: b.part, x: b.x, y: b.y, z: b.z, rot: b.rot },
  ]);
}

describe("template catalogue", () => {
  it("has the three Phase 2 starters with unique ids", () => {
    expect(TEMPLATES).toHaveLength(3);
    expect(TEMPLATES.map((t) => t.id).sort()).toEqual(["card-frame", "flower-stem", "heart"]);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(3);
  });

  it("looks templates up by id", () => {
    expect(getTemplate("heart")?.name).toBe("Heart");
    expect(getTemplate("nope")).toBeUndefined();
  });

  it("is not empty and names every template", () => {
    for (const template of TEMPLATES) {
      expect(template.bricks.length).toBeGreaterThan(0);
      expect(template.name.length).toBeGreaterThan(0);
      expect(template.description.length).toBeGreaterThan(0);
    }
  });
});

describe("every template is buildable", () => {
  it.each(TEMPLATES.map((t) => [t.id, t] as const))(
    "%s uses only catalogue parts and palette colours",
    (_id, template) => {
      for (const brick of template.bricks) {
        expect(getPart(brick.part), `part ${brick.part}`).toBeDefined();
        expect(getColor(brick.color), `colour ${brick.color}`).toBeDefined();
      }
    },
  );

  it.each(TEMPLATES.map((t) => [t.id, t] as const))(
    "%s has no bricks overlapping each other",
    (_id, template) => {
      expect(isConflictFree(asPlacements(template))).toBe(true);
    },
  );

  it.each(TEMPLATES.map((t) => [t.id, t] as const))(
    "%s sits at or above the baseplate",
    (_id, template) => {
      for (const brick of placeTemplate(template, 0, 0, 0)) {
        expect(brick.y).toBeGreaterThanOrEqual(0);
      }
    },
  );

  it.each(TEMPLATES.map((t) => [t.id, t] as const))(
    "%s fits on a 32x32 baseplate",
    (_id, template) => {
      const { width, depth } = templateFootprint(template);
      expect(width).toBeLessThanOrEqual(BASEPLATE_SIZE);
      expect(depth).toBeLessThanOrEqual(BASEPLATE_SIZE);

      for (const [, placement] of asPlacements(template)) {
        expect(isWithinBaseplate(placement)).toBe(true);
      }
    },
  );

  /**
   * Checks the template is one connected lump, rather than that every brick rests on something.
   * A leaf sticking out from a stem is a cantilever — perfectly normal, and a "supported from
   * below" rule would wrongly reject it. What actually matters is that no brick floats off on
   * its own.
   */
  it.each(TEMPLATES.map((t) => [t.id, t] as const))(
    "%s is a single connected lump",
    (_id, template) => {
      const placements = asPlacements(template);
      const owner = new Map<string, string>();

      const cellsOf = (p: Placement): string[] => {
        const w = p.rot % 2 === 0 ? p.part.width : p.part.depth;
        const d = p.rot % 2 === 0 ? p.part.depth : p.part.width;
        const cells: string[] = [];
        for (let dx = 0; dx < w; dx++) {
          for (let dz = 0; dz < d; dz++) {
            for (let dy = 0; dy < p.part.height; dy++) {
              cells.push(`${p.x + dx},${p.y + dy},${p.z + dz}`);
            }
          }
        }
        return cells;
      };

      for (const [id, p] of placements) {
        for (const cell of cellsOf(p)) owner.set(cell, id);
      }

      // Build an adjacency map over bricks that share a face.
      const neighbours = new Map<string, Set<string>>();
      for (const [id] of placements) neighbours.set(id, new Set());
      for (const [id, p] of placements) {
        for (const cell of cellsOf(p)) {
          const [cx, cy, cz] = cell.split(",").map(Number) as [number, number, number];
          const offsets: readonly (readonly [number, number, number])[] = [
            [1, 0, 0],
            [-1, 0, 0],
            [0, 1, 0],
            [0, -1, 0],
            [0, 0, 1],
            [0, 0, -1],
          ];
          for (const [ox, oy, oz] of offsets) {
            const other = owner.get(`${cx + ox},${cy + oy},${cz + oz}`);
            if (other && other !== id) {
              neighbours.get(id)!.add(other);
              neighbours.get(other)!.add(id);
            }
          }
        }
      }

      const start = placements[0]![0];
      const seen = new Set([start]);
      const queue = [start];
      while (queue.length > 0) {
        for (const next of neighbours.get(queue.pop()!) ?? []) {
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }

      const orphans = placements.filter(([id]) => !seen.has(id)).map(([id]) => id);
      expect(orphans, `detached bricks in ${template.id}`).toEqual([]);
    },
  );
});

describe("templateFootprint", () => {
  it("accounts for each brick's rotated footprint", () => {
    const frame = getTemplate("card-frame")!;
    const { width, depth } = templateFootprint(frame);
    // Both edges are 2x4 bricks turned sideways, so each is 4 wide and 2 deep.
    expect(width).toBe(8);
    expect(depth).toBe(8);
  });

  it("measures the heart at 5x5", () => {
    const { width, depth, height } = templateFootprint(getTemplate("heart")!);
    expect({ width, depth, height }).toEqual({ width: 5, depth: 5, height: 1 });
  });

  it("reports height in plates", () => {
    const flower = getTemplate("flower-stem")!;
    expect(templateFootprint(flower).height).toBe(13); // bloom plate at 12, one plate tall
  });
});

describe("placeTemplate", () => {
  it("offsets every brick by the target corner", () => {
    const heart = getTemplate("heart")!;
    const atOrigin = placeTemplate(heart, 0, 0, 0);
    const moved = placeTemplate(heart, 10, 3, 7);

    expect(moved).toHaveLength(atOrigin.length);
    for (let i = 0; i < moved.length; i++) {
      expect(moved[i]!.x).toBe(atOrigin[i]!.x + 10);
      expect(moved[i]!.y).toBe(atOrigin[i]!.y + 3);
      expect(moved[i]!.z).toBe(atOrigin[i]!.z + 7);
      expect(moved[i]!.rot).toBe(atOrigin[i]!.rot);
      expect(moved[i]!.color).toBe(atOrigin[i]!.color);
    }
  });

  it("stays conflict-free after being moved", () => {
    for (const template of TEMPLATES) {
      expect(isConflictFree(asPlacements(template, 12, 0, 9))).toBe(true);
    }
  });

  it("resolves part ids to catalogue parts", () => {
    const placed = placeTemplate(getTemplate("flower-stem")!, 0, 0, 0);
    expect(placed.every((b) => typeof b.part.width === "number")).toBe(true);
  });
});
