/**
 * Starter templates.
 *
 * Small pre-built arrangements someone can stamp down and then edit. They exist to pass the
 * "five-minute flower" test in PLAN.md principle 2: a first-time visitor should get to something
 * that looks like a thing before they get bored of placing single bricks.
 *
 * A template is stored as **relative** placements — offsets from the template's own origin
 * corner, with `y` relative to wherever the template is dropped. The caller turns those into
 * real bricks with fresh ids. Nothing here knows about Yjs or nanoid.
 */

import { getPart, type Part } from "./parts";
import { footprintCells, rotatedFootprint, type Placement, type Rotation } from "./grid";
import { canPlace, type Occupancy } from "./collision";

/** One brick within a template, positioned relative to the template origin. */
export type TemplateBrick = {
  part: string;
  color: number;
  /** Studs right of the template origin. */
  dx: number;
  /** Plates above the template base. */
  dy: number;
  /** Studs forward of the template origin. */
  dz: number;
  rot: Rotation;
};

export type Template = {
  id: string;
  name: string;
  /** One line on what it is, shown in the picker. */
  description: string;
  bricks: readonly TemplateBrick[];
};

/** Shorthand for a template brick, to keep the layouts below readable. */
function b(
  part: string,
  color: number,
  dx: number,
  dy: number,
  dz: number,
  rot: Rotation = 0,
): TemplateBrick {
  return { part, color, dx, dy, dz, rot };
}

// LDraw colour codes used below: 2 green, 4 red, 14 yellow, 15 white, 19 tan, 25 orange,
// 27 lime, 29 bright pink, 71 light bluish gray.

/**
 * A flower on a stem: four stacked 1x1 green bricks, a yellow centre, and four pink petals
 * around it one plate up.
 */
const FLOWER_STEM: Template = {
  id: "flower-stem",
  name: "Flower",
  description: "A stem with a four-petal bloom",
  bricks: [
    // Stem — four 1x1 bricks, each 3 plates tall.
    b("3005", 2, 1, 0, 1),
    b("3005", 2, 1, 3, 1),
    b("3005", 2, 1, 6, 1),
    b("3005", 27, 1, 9, 1),
    // A leaf part way up.
    b("3023b", 27, 2, 6, 1, 1),
    // Bloom at plate 12: yellow centre with four petals around it.
    b("3024", 14, 1, 12, 1),
    b("3024", 29, 0, 12, 1),
    b("3024", 29, 2, 12, 1),
    b("3024", 29, 1, 12, 0),
    b("3024", 29, 1, 12, 2),
  ],
};

/**
 * A heart lying flat, one plate thick, on a 5x5 footprint.
 *
 * Tiled row by row. Rotation 1 turns a 1xN plate to run along X, which is what makes the wide
 * rows expressible with the small palette:
 *
 *   z0:  ##.##     z1:  #####     z2:  #####     z3:  .###.     z4:  ..#..
 */
const HEART: Template = {
  id: "heart",
  name: "Heart",
  description: "A flat heart in plates",
  bricks: [
    // z0 — the two lobes, a 1x2 turned sideways each.
    b("3023b", 4, 0, 0, 0, 1),
    b("3023b", 4, 3, 0, 0, 1),
    // z1 and z2 — full width, a 1x4 turned sideways plus a single.
    b("3710", 4, 0, 0, 1, 1),
    b("3024", 4, 4, 0, 1),
    b("3710", 4, 0, 0, 2, 1),
    b("3024", 4, 4, 0, 2),
    // z3 — narrowing.
    b("3023b", 4, 1, 0, 3, 1),
    b("3024", 4, 3, 0, 3),
    // z4 — the point.
    b("3024", 4, 2, 0, 4),
  ],
};

/**
 * A square border to build or write inside: 8 studs across, 8 deep, one brick tall.
 *
 * A 2x4 turned sideways is 4 wide and 2 deep, so two of them make each 8-wide edge. The side
 * walls are 1x4 bricks filling the 4 studs between the front and back edges.
 */
const CARD_FRAME: Template = {
  id: "card-frame",
  name: "Card frame",
  description: "An 8x8 border to build inside",
  bricks: [
    // Front edge, z0-1.
    b("3001", 19, 0, 0, 0, 1),
    b("3001", 19, 4, 0, 0, 1),
    // Back edge, z6-7.
    b("3001", 19, 0, 0, 6, 1),
    b("3001", 19, 4, 0, 6, 1),
    // Side walls, z2-5.
    b("3010", 71, 0, 0, 2),
    b("3010", 71, 7, 0, 2),
    // Corner accents, sitting on the brick-high edges.
    b("3005", 25, 0, 3, 0),
    b("3005", 25, 7, 3, 0),
    b("3005", 25, 0, 3, 7),
    b("3005", 25, 7, 3, 7),
  ],
};

export const TEMPLATES: readonly Template[] = [FLOWER_STEM, HEART, CARD_FRAME];

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export type TemplateFootprint = {
  /** Extent along X, in studs. */
  width: number;
  /** Extent along Z, in studs. */
  depth: number;
  /** Height in plates. */
  height: number;
};

/**
 * The bounding box a template occupies, accounting for each brick's own rotated footprint.
 *
 * Used to centre a template on the cursor and to keep it on the baseplate.
 */
export function templateFootprint(template: Template): TemplateFootprint {
  let width = 0;
  let depth = 0;
  let height = 0;

  for (const brick of template.bricks) {
    const part = getPart(brick.part);
    if (!part) continue;
    const size = rotatedFootprint(part, brick.rot);
    width = Math.max(width, brick.dx + size.width);
    depth = Math.max(depth, brick.dz + size.depth);
    height = Math.max(height, brick.dy + part.height);
  }

  return { width, depth, height };
}

/** A template brick resolved to absolute grid coordinates, ready to become a `Brick`. */
export type PlacedTemplateBrick = {
  part: Part;
  color: number;
  x: number;
  y: number;
  z: number;
  rot: Rotation;
};

/**
 * Resolve a template to absolute coordinates with its origin corner at `(x, y, z)`.
 *
 * Bricks whose part is missing from the catalogue are dropped rather than guessed at.
 */
export function placeTemplate(
  template: Template,
  x: number,
  y: number,
  z: number,
): PlacedTemplateBrick[] {
  const placed: PlacedTemplateBrick[] = [];

  for (const brick of template.bricks) {
    const part = getPart(brick.part);
    if (!part) continue;
    placed.push({
      part,
      color: brick.color,
      x: x + brick.dx,
      y: y + brick.dy,
      z: z + brick.dz,
      rot: brick.rot,
    });
  }

  return placed;
}

/** A placed template brick expressed as a `Placement`, for collision and bounds checks. */
export function toPlacements(placed: readonly PlacedTemplateBrick[]): Placement[] {
  return placed.map((b) => ({ part: b.part, x: b.x, y: b.y, z: b.z, rot: b.rot }));
}

/**
 * The base plate level at which a template comes to rest if dropped at `(x, z)`.
 *
 * The template falls as one rigid piece, so the answer is the greatest lift any single brick
 * demands: a brick sitting `dy` plates up needs the base at least `columnTop - dy` high to clear
 * what is beneath it.
 */
export function templateRestingY(
  template: Template,
  occupancy: Occupancy,
  x: number,
  z: number,
): number {
  let base = 0;

  for (const brick of placeTemplate(template, x, 0, z)) {
    const placement: Placement = {
      part: brick.part,
      x: brick.x,
      y: brick.y,
      z: brick.z,
      rot: brick.rot,
    };
    for (const [cx, cz] of footprintCells(placement)) {
      const needed = occupancy.columnTop(cx, cz) - brick.y;
      if (needed > base) base = needed;
    }
  }

  return Math.max(0, base);
}

/** True if every brick of a placed template may legally go where it is. */
export function canPlaceTemplate(
  placed: readonly PlacedTemplateBrick[],
  occupancy: Occupancy,
  baseplateSize?: number,
): boolean {
  return toPlacements(placed).every(
    (placement) =>
      canPlace(placement, occupancy, baseplateSize === undefined ? {} : { baseplateSize }).ok,
  );
}

/** Shift a template so its footprint is centred on `(cellX, cellZ)`. */
export function centerTemplateOnCell(
  template: Template,
  cellX: number,
  cellZ: number,
): { x: number; z: number } {
  const { width, depth } = templateFootprint(template);
  return {
    x: cellX - Math.floor((width - 1) / 2),
    z: cellZ - Math.floor((depth - 1) / 2),
  };
}

/** Clamp a template's origin so its whole footprint stays on the baseplate. */
export function clampTemplateToBaseplate(
  template: Template,
  x: number,
  z: number,
  size: number,
): { x: number; z: number } {
  const { width, depth } = templateFootprint(template);
  return {
    x: Math.min(Math.max(x, 0), Math.max(0, size - width)),
    z: Math.min(Math.max(z, 0), Math.max(0, size - depth)),
  };
}
