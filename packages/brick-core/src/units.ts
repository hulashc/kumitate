/**
 * Unit conversion between the integer build grid and LDraw units (LDU).
 *
 * The Yjs document only ever stores grid integers. Floats appear exactly once, at the renderer
 * boundary, via the helpers in this file. See PLAN.md section 5.
 */

/** Width of one stud, in LDraw units. */
export const LDU_PER_STUD = 20;

/** Height of one plate, in LDraw units. */
export const LDU_PER_PLATE = 8;

/** Plates in one full-height brick. */
export const PLATES_PER_BRICK = 3;

/** Height of one full brick, in LDraw units (24). */
export const LDU_PER_BRICK = LDU_PER_PLATE * PLATES_PER_BRICK;

/**
 * Scene units per LDU.
 *
 * three.js is happiest around unit scale, and LDU values are large (a 2x4 brick is 80 LDU wide).
 * Dividing by `LDU_PER_STUD` makes one stud exactly 1.0 scene units, which keeps the camera,
 * lighting and shadow-map defaults in a sane range.
 */
export const SCENE_UNITS_PER_LDU = 1 / LDU_PER_STUD;

/** One stud in scene units (1.0 by definition). */
export const SCENE_PER_STUD = LDU_PER_STUD * SCENE_UNITS_PER_LDU;

/** One plate in scene units (0.4). */
export const SCENE_PER_PLATE = LDU_PER_PLATE * SCENE_UNITS_PER_LDU;

/** Convert a horizontal grid distance (studs) to scene units. */
export function studsToScene(studs: number): number {
  return studs * SCENE_PER_STUD;
}

/** Convert a vertical grid distance (plates) to scene units. */
export function platesToScene(plates: number): number {
  return plates * SCENE_PER_PLATE;
}

/** Convert a horizontal scene distance back to studs (unrounded). */
export function sceneToStuds(scene: number): number {
  return scene / SCENE_PER_STUD;
}

/** Convert a vertical scene distance back to plates (unrounded). */
export function sceneToPlates(scene: number): number {
  return scene / SCENE_PER_PLATE;
}

/** Convert a grid distance in plates to whole bricks (may be fractional). */
export function platesToBricks(plates: number): number {
  return plates / PLATES_PER_BRICK;
}

/** Convert whole bricks to plates. */
export function bricksToPlates(bricks: number): number {
  return bricks * PLATES_PER_BRICK;
}
