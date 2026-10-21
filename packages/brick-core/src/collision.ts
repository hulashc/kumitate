/**
 * Occupancy index and placement rules.
 *
 * Everything here is integer set maths over grid cells. There is no geometry and no tolerance,
 * so two clients given the same bricks always reach the same answer.
 *
 * Known Phase 1 limitation (PLAN.md section 6): this resolves collisions at *placement* time on
 * one client. Two people placing overlapping bricks in the same instant can both succeed, because
 * neither saw the other's brick yet. Phase 2 adds a deterministic post-merge resolver.
 */

import {
  BASEPLATE_SIZE,
  cellKey,
  columnKey,
  containsCell,
  footprintCells,
  isWithinBaseplate,
  occupiedCells,
  topOf,
  type Placement,
} from "./grid";

/** Why a placement was rejected. */
export type PlacementError = "collision" | "out-of-bounds" | "below-baseplate";

export type PlacementResult =
  | { ok: true }
  | {
      ok: false;
      reason: PlacementError;
      /** Brick already in the way, when known. */ blockedBy?: string;
    };

/**
 * A spatial index over placed bricks.
 *
 * Maintains two views: cell -> brick id for overlap tests, and column -> brick ids for working
 * out how high a new brick lands. Both are rebuilt incrementally so a 2,000 brick scene stays
 * cheap to query every frame while the ghost follows the cursor.
 */
export class Occupancy {
  readonly #cells = new Map<string, string>();
  readonly #columns = new Map<string, Set<string>>();
  readonly #placements = new Map<string, Placement>();

  /** Number of indexed bricks. */
  get size(): number {
    return this.#placements.size;
  }

  /** Every indexed brick id. */
  ids(): IterableIterator<string> {
    return this.#placements.keys();
  }

  has(id: string): boolean {
    return this.#placements.has(id);
  }

  get(id: string): Placement | undefined {
    return this.#placements.get(id);
  }

  /**
   * Index a brick. Re-adding an existing id replaces it, so this doubles as "move".
   *
   * Overlapping cells are overwritten rather than rejected — the index records what *is*, and
   * callers use {@link canPlace} to decide what *may be*. Keeping those separate is what lets a
   * post-merge resolver load a conflicting state in Phase 2 without the index throwing.
   */
  add(id: string, placement: Placement): void {
    if (this.#placements.has(id)) this.remove(id);

    this.#placements.set(id, placement);
    for (const [x, y, z] of occupiedCells(placement)) {
      this.#cells.set(cellKey(x, y, z), id);
    }
    for (const [x, z] of footprintCells(placement)) {
      const key = columnKey(x, z);
      let column = this.#columns.get(key);
      if (!column) {
        column = new Set();
        this.#columns.set(key, column);
      }
      column.add(id);
    }
  }

  /** Remove a brick from the index. Returns false if it was not there. */
  remove(id: string): boolean {
    const placement = this.#placements.get(id);
    if (!placement) return false;

    for (const [x, y, z] of occupiedCells(placement)) {
      const key = cellKey(x, y, z);
      // Only touch the cell if we still own it — a later overlapping add may have taken it.
      if (this.#cells.get(key) !== id) continue;

      // Hand the cell back to any other brick still overlapping it rather than clearing it.
      // Overlaps are transient (the resolver removes the loser), but between the merge and the
      // cleanup the index must not claim an occupied cell is free.
      const successor = this.#occupantOf(x, y, z, id);
      if (successor !== undefined) this.#cells.set(key, successor);
      else this.#cells.delete(key);
    }
    for (const [x, z] of footprintCells(placement)) {
      const key = columnKey(x, z);
      const column = this.#columns.get(key);
      if (!column) continue;
      column.delete(id);
      if (column.size === 0) this.#columns.delete(key);
    }
    this.#placements.delete(id);
    return true;
  }

  clear(): void {
    this.#cells.clear();
    this.#columns.clear();
    this.#placements.clear();
  }

  /** The brick filling a single cell, if any. */
  at(x: number, y: number, z: number): string | undefined {
    return this.#cells.get(cellKey(x, y, z));
  }

  /**
   * The first brick overlapping `placement`, or `undefined` if the space is free.
   * `ignoreId` skips one brick — pass the brick being moved so it does not block itself.
   */
  firstCollision(placement: Placement, ignoreId?: string): string | undefined {
    for (const [x, y, z] of occupiedCells(placement)) {
      const hit = this.#cells.get(cellKey(x, y, z));
      if (hit !== undefined && hit !== ignoreId) return hit;
    }
    return undefined;
  }

  /** True if `placement` overlaps anything already indexed. */
  collides(placement: Placement, ignoreId?: string): boolean {
    return this.firstCollision(placement, ignoreId) !== undefined;
  }

  /**
   * The exclusive top plate level of the tallest brick in a stud column, or 0 if the column is
   * empty (i.e. bare baseplate).
   */
  columnTop(x: number, z: number, ignoreId?: string): number {
    const column = this.#columns.get(columnKey(x, z));
    if (!column) return 0;

    let top = 0;
    for (const id of column) {
      if (id === ignoreId) continue;
      const placement = this.#placements.get(id);
      if (!placement) continue;
      const candidate = topOf(placement);
      if (candidate > top) top = candidate;
    }
    return top;
  }

  /**
   * The plate level a placement comes to rest at if dropped straight down: the highest column top
   * under its footprint.
   *
   * This is deliberately forgiving — it is why you can slide a 2x4 over a messy stack and have it
   * land flat on the highest thing underneath instead of refusing to place.
   */
  restingY(placement: Placement, ignoreId?: string): number {
    let y = 0;
    for (const [x, z] of footprintCells(placement)) {
      const top = this.columnTop(x, z, ignoreId);
      if (top > y) y = top;
    }
    return y;
  }

  /** `placement` dropped to its resting level. */
  drop(placement: Placement, ignoreId?: string): Placement {
    return { ...placement, y: this.restingY(placement, ignoreId) };
  }

  /**
   * Any brick other than `exclude` whose volume covers this cell.
   *
   * Scans only the bricks registered in that stud column, which is a handful even in a tall
   * build, so this stays cheap enough to run per cell during a removal.
   */
  #occupantOf(x: number, y: number, z: number, exclude: string): string | undefined {
    const column = this.#columns.get(columnKey(x, z));
    if (!column) return undefined;

    for (const id of column) {
      if (id === exclude) continue;
      const placement = this.#placements.get(id);
      if (placement && containsCell(placement, x, y, z)) return id;
    }
    return undefined;
  }

  /** Build an index from stored placements. */
  static from(entries: Iterable<readonly [string, Placement]>): Occupancy {
    const occupancy = new Occupancy();
    for (const [id, placement] of entries) occupancy.add(id, placement);
    return occupancy;
  }
}

export type CanPlaceOptions = {
  /** Brick to ignore when testing — the one being moved. */
  ignoreId?: string;
  /** Baseplate edge length in studs. Pass `Infinity` to disable the bounds check. */
  baseplateSize?: number;
};

/** Whether a placement is legal: on the plate, above the floor, and not overlapping anything. */
export function canPlace(
  placement: Placement,
  occupancy: Occupancy,
  options: CanPlaceOptions = {},
): PlacementResult {
  const { ignoreId, baseplateSize = BASEPLATE_SIZE } = options;

  if (placement.y < 0) return { ok: false, reason: "below-baseplate" };
  if (Number.isFinite(baseplateSize) && !isWithinBaseplate(placement, baseplateSize)) {
    return { ok: false, reason: "out-of-bounds" };
  }

  const blockedBy = occupancy.firstCollision(placement, ignoreId);
  if (blockedBy !== undefined) return { ok: false, reason: "collision", blockedBy };

  return { ok: true };
}
