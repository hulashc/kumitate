/**
 * Integer grid maths.
 *
 * Coordinate system (PLAN.md section 5):
 *   - `x`, `z` are stud columns, `y` is a plate level, all integers.
 *   - `y = 0` sits directly on the baseplate.
 *   - A brick's `(x, y, z)` is its **minimum corner** after rotation, never its centre. Storing
 *     the min corner means the occupied volume is always `[x, x+W) x [y, y+H) x [z, z+D)` with no
 *     rounding anywhere, which is what keeps concurrent edits from drifting.
 */

import type { Part } from "./parts.js";

/** Quarter turns around the Y axis. */
export type Rotation = 0 | 1 | 2 | 3;

export const ROTATIONS: readonly Rotation[] = [0, 1, 2, 3];

/** Edge length of the Phase 1 baseplate, in studs. */
export const BASEPLATE_SIZE = 32;

/** A brick as stored in the Yjs document. */
export type Brick = {
  /** nanoid. */
  id: string;
  /** LDraw part ID. */
  part: string;
  /** LDraw colour code. */
  color: number;
  /** Stud column, integer. */
  x: number;
  /** Plate level, integer. 0 rests on the baseplate. */
  y: number;
  /** Stud column, integer. */
  z: number;
  rot: Rotation;
  /** clientId of whoever placed it — drives undo scoping and attribution. */
  by: string;
};

/** A placement under consideration: everything needed to test it, without an id or author. */
export type Placement = {
  part: Part;
  x: number;
  y: number;
  z: number;
  rot: Rotation;
};

export type Footprint = {
  /** Extent along world X, in studs. */
  width: number;
  /** Extent along world Z, in studs. */
  depth: number;
};

/** Next rotation clockwise. */
export function nextRotation(rot: Rotation): Rotation {
  return ((rot + 1) % 4) as Rotation;
}

/** Previous rotation. */
export function prevRotation(rot: Rotation): Rotation {
  return ((rot + 3) % 4) as Rotation;
}

/**
 * A part's world-space footprint at a given rotation. Odd quarter turns swap the axes; the
 * rectangle itself is unchanged, which is why collision never needs to know the rotation.
 */
export function rotatedFootprint(part: Part, rot: Rotation): Footprint {
  return rot % 2 === 0
    ? { width: part.width, depth: part.depth }
    : { width: part.depth, depth: part.width };
}

/**
 * Rotate a local cell offset into a world cell offset, relative to the brick's minimum corner.
 *
 * Rotations are clockwise looking down the +Y axis. The result is always inside the rotated
 * footprint, so the minimum corner stays the minimum corner at every rotation.
 */
export function rotateCell(
  part: Part,
  rot: Rotation,
  localX: number,
  localZ: number,
): readonly [number, number] {
  const { width: w, depth: d } = part;
  switch (rot) {
    case 0:
      return [localX, localZ];
    case 1:
      return [d - 1 - localZ, localX];
    case 2:
      return [w - 1 - localX, d - 1 - localZ];
    case 3:
      return [localZ, w - 1 - localX];
  }
}

/**
 * Every `(x, z)` stud column a placement covers. Order is row-major over the rotated footprint.
 */
export function footprintCells(placement: Placement): ReadonlyArray<readonly [number, number]> {
  const { width, depth } = rotatedFootprint(placement.part, placement.rot);
  const cells: Array<readonly [number, number]> = [];
  for (let dz = 0; dz < depth; dz++) {
    for (let dx = 0; dx < width; dx++) {
      cells.push([placement.x + dx, placement.z + dz]);
    }
  }
  return cells;
}

/** Every `(x, y, z)` cell a placement fills, across its full height in plates. */
export function occupiedCells(
  placement: Placement,
): ReadonlyArray<readonly [number, number, number]> {
  const cells: Array<readonly [number, number, number]> = [];
  for (const [x, z] of footprintCells(placement)) {
    for (let dy = 0; dy < placement.part.height; dy++) {
      cells.push([x, placement.y + dy, z]);
    }
  }
  return cells;
}

/**
 * World stud columns carrying a stud on top of this placement, with the plate level the stud
 * sits at. Used to draw studs and, later, to decide what can connect.
 */
export function studCells(
  placement: Placement,
): ReadonlyArray<{ x: number; y: number; z: number }> {
  const { part, rot } = placement;
  if (part.studs === "none") return [];

  const out: Array<{ x: number; y: number; z: number }> = [];
  const maxLocalZ = part.studs === "high-edge" ? 1 : part.depth;
  for (let lz = 0; lz < maxLocalZ; lz++) {
    for (let lx = 0; lx < part.width; lx++) {
      const [dx, dz] = rotateCell(part, rot, lx, lz);
      out.push({ x: placement.x + dx, y: placement.y + part.height, z: placement.z + dz });
    }
  }
  return out;
}

/** The exclusive top plate level of a placement. */
export function topOf(placement: Placement): number {
  return placement.y + placement.part.height;
}

/** Key for a single `(x, y, z)` cell. */
export function cellKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

/** Key for an `(x, z)` stud column. */
export function columnKey(x: number, z: number): string {
  return `${x},${z}`;
}

/** True if every column of a placement lies on the baseplate. */
export function isWithinBaseplate(placement: Placement, size: number = BASEPLATE_SIZE): boolean {
  const { width, depth } = rotatedFootprint(placement.part, placement.rot);
  return (
    placement.x >= 0 &&
    placement.z >= 0 &&
    placement.x + width <= size &&
    placement.z + depth <= size
  );
}

/**
 * Clamp a placement's minimum corner so the whole footprint stays on the baseplate.
 *
 * Used while dragging the ghost near an edge: the brick slides back onto the plate rather than
 * disappearing, which is far less fiddly than refusing to show it.
 */
export function clampToBaseplate(placement: Placement, size: number = BASEPLATE_SIZE): Placement {
  const { width, depth } = rotatedFootprint(placement.part, placement.rot);
  return {
    ...placement,
    x: Math.min(Math.max(placement.x, 0), Math.max(0, size - width)),
    z: Math.min(Math.max(placement.z, 0), Math.max(0, size - depth)),
  };
}

/**
 * Shift a placement so its footprint is centred on `(cellX, cellZ)`.
 *
 * The cursor points at one stud column, but a 2x4 brick should straddle it rather than hang off
 * its corner. Centring uses `floor((n-1)/2)`, so even-width parts sit one stud "back" from the
 * cursor — consistent, and it matches where the ghost looks like it should be.
 */
export function centerOnCell(part: Part, rot: Rotation, cellX: number, cellZ: number): Placement {
  const { width, depth } = rotatedFootprint(part, rot);
  return {
    part,
    rot,
    x: cellX - Math.floor((width - 1) / 2),
    z: cellZ - Math.floor((depth - 1) / 2),
    y: 0,
  };
}

/** Convert a stored brick plus its resolved part into a `Placement`. */
export function toPlacement(brick: Brick, part: Part): Placement {
  return { part, x: brick.x, y: brick.y, z: brick.z, rot: brick.rot };
}
