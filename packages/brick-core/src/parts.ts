/**
 * The Kumitate part catalogue: 16 parts, keyed by official LDraw part ID.
 *
 * Phase 1 renders these procedurally (a box body plus cylinder studs). Keying on the LDraw ID
 * means Phase 4 can swap in real LDraw meshes without touching stored builds — see PLAN.md.
 *
 * Every ID below was verified against the official library at
 * `library.ldraw.org/library/official/parts/<id>.dat` in October 2026. Two IDs from the original
 * brief have been renamed upstream and are recorded in `aliases`:
 *
 *   - Plate 1 x 2      — `3023` was moved to `3023b` (LDraw update 2024-07)
 *   - Plate 1 x 1 Round — `4073` was moved to `6141` (LDraw update 2025-04)
 *
 * `aliases` holds the legacy IDs, which are still what BrickLink uses. Phase 3's Wanted List
 * export should prefer the alias when one is present.
 */

import { PLATES_PER_BRICK } from "./units";

export type PartCategory = "brick" | "plate" | "tile" | "slope";

/** How the renderer should build the body mesh. */
export type PartShape =
  /** Rectangular box spanning the full footprint. */
  | "box"
  /** Cylinder inscribed in a 1x1 footprint. */
  | "cylinder"
  /** Box with the top sheared off along +Z, high edge at z = 0. */
  | "slope";

/** Which cells of the footprint carry a stud on top. */
export type StudLayout =
  /** Every cell in the footprint. */
  | "all"
  /** None — tiles are smooth. */
  | "none"
  /** Only the row at local z = 0, the slope's high edge. */
  | "high-edge";

export type Part = {
  /** Canonical LDraw part ID. The key stored in the Yjs document. */
  id: string;
  /** Human label for the toolbar. */
  name: string;
  category: PartCategory;
  /** Footprint along local X, in studs. */
  width: number;
  /** Footprint along local Z, in studs. */
  depth: number;
  /** Height in plates. A full brick is 3. */
  height: number;
  shape: PartShape;
  studs: StudLayout;
  /**
   * Superseded LDraw IDs and BrickLink IDs for the same physical part. Used by the Phase 3
   * BrickLink export; never used as a lookup key for stored bricks.
   */
  aliases: readonly string[];
};

const BRICK = PLATES_PER_BRICK; // 3 plates
const PLATE = 1;

export const PARTS = [
  // ---- Bricks ------------------------------------------------------------
  {
    id: "3005",
    name: "Brick 1 x 1",
    category: "brick",
    width: 1,
    depth: 1,
    height: BRICK,
    shape: "box",
    studs: "all",
    aliases: [],
  },
  {
    id: "3004",
    name: "Brick 1 x 2",
    category: "brick",
    width: 1,
    depth: 2,
    height: BRICK,
    shape: "box",
    studs: "all",
    aliases: [],
  },
  {
    id: "3010",
    name: "Brick 1 x 4",
    category: "brick",
    width: 1,
    depth: 4,
    height: BRICK,
    shape: "box",
    studs: "all",
    aliases: [],
  },
  {
    id: "3003",
    name: "Brick 2 x 2",
    category: "brick",
    width: 2,
    depth: 2,
    height: BRICK,
    shape: "box",
    studs: "all",
    aliases: [],
  },
  {
    id: "3002",
    name: "Brick 2 x 3",
    category: "brick",
    width: 2,
    depth: 3,
    height: BRICK,
    shape: "box",
    studs: "all",
    aliases: [],
  },
  {
    id: "3001",
    name: "Brick 2 x 4",
    category: "brick",
    width: 2,
    depth: 4,
    height: BRICK,
    shape: "box",
    studs: "all",
    aliases: [],
  },

  // ---- Plates ------------------------------------------------------------
  {
    id: "3024",
    name: "Plate 1 x 1",
    category: "plate",
    width: 1,
    depth: 1,
    height: PLATE,
    shape: "box",
    studs: "all",
    aliases: [],
  },
  {
    id: "3023b",
    name: "Plate 1 x 2",
    category: "plate",
    width: 1,
    depth: 2,
    height: PLATE,
    shape: "box",
    studs: "all",
    // 3023 was moved to 3023b by LDraw in 2024-07; BrickLink still lists it as 3023.
    aliases: ["3023"],
  },
  {
    id: "3710",
    name: "Plate 1 x 4",
    category: "plate",
    width: 1,
    depth: 4,
    height: PLATE,
    shape: "box",
    studs: "all",
    aliases: [],
  },
  {
    id: "3022",
    name: "Plate 2 x 2",
    category: "plate",
    width: 2,
    depth: 2,
    height: PLATE,
    shape: "box",
    studs: "all",
    aliases: [],
  },
  {
    id: "3020",
    name: "Plate 2 x 4",
    category: "plate",
    width: 2,
    depth: 4,
    height: PLATE,
    shape: "box",
    studs: "all",
    aliases: [],
  },
  {
    id: "6141",
    name: "Plate 1 x 1 Round",
    category: "plate",
    width: 1,
    depth: 1,
    height: PLATE,
    shape: "cylinder",
    studs: "all",
    // 4073 was moved to 6141 by LDraw in 2025-04; BrickLink still lists it as 4073.
    aliases: ["4073"],
  },

  // ---- Tiles (no studs) --------------------------------------------------
  {
    id: "3070b",
    name: "Tile 1 x 1",
    category: "tile",
    width: 1,
    depth: 1,
    height: PLATE,
    shape: "box",
    studs: "none",
    aliases: [],
  },
  {
    id: "3069b",
    name: "Tile 1 x 2",
    category: "tile",
    width: 1,
    depth: 2,
    height: PLATE,
    shape: "box",
    studs: "none",
    aliases: [],
  },
  {
    id: "3068b",
    name: "Tile 2 x 2",
    category: "tile",
    width: 2,
    depth: 2,
    height: PLATE,
    shape: "box",
    studs: "none",
    aliases: [],
  },

  // ---- Slope -------------------------------------------------------------
  {
    id: "3039",
    name: "Slope 45 2 x 2",
    category: "slope",
    width: 2,
    depth: 2,
    height: BRICK,
    shape: "slope",
    studs: "high-edge",
    aliases: [],
  },
] as const satisfies readonly Part[];

export type PartId = (typeof PARTS)[number]["id"];

const BY_ID: ReadonlyMap<string, Part> = new Map(PARTS.map((p) => [p.id, p]));

/** The part a new session starts on. */
export const DEFAULT_PART: PartId = "3001";

/** Look up a part by LDraw ID. Returns `undefined` if it is not in the catalogue. */
export function getPart(id: string): Part | undefined {
  return BY_ID.get(id);
}

/** True if `id` names a catalogue part. */
export function isKnownPart(id: string): id is PartId {
  return BY_ID.has(id);
}

/**
 * Look up a part, falling back to the default rather than throwing.
 *
 * The renderer must never crash on an unknown part: a peer on a newer build could place something
 * this client's catalogue does not have yet.
 */
export function getPartOrDefault(id: string): Part {
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT_PART)!;
}

/**
 * Resolve a part ID that may be a legacy alias (e.g. BrickLink's `3023`) to the canonical
 * catalogue part. Returns `undefined` if nothing matches.
 */
export function resolvePart(id: string): Part | undefined {
  const direct = BY_ID.get(id);
  if (direct) return direct;
  return PARTS.find((p) => (p.aliases as readonly string[]).includes(id));
}

/**
 * Local stud cell coordinates for a part, before rotation. Cells are `[x, z]` offsets from the
 * part's minimum corner.
 */
export function localStudCells(part: Part): ReadonlyArray<readonly [number, number]> {
  if (part.studs === "none") return [];

  const cells: Array<readonly [number, number]> = [];
  const maxZ = part.studs === "high-edge" ? 1 : part.depth;
  for (let z = 0; z < maxZ; z++) {
    for (let x = 0; x < part.width; x++) {
      cells.push([x, z]);
    }
  }
  return cells;
}

/** Parts grouped by category, in catalogue order — the toolbar renders them in these groups. */
export function partsByCategory(): ReadonlyArray<{
  category: PartCategory;
  parts: readonly Part[];
}> {
  const order: readonly PartCategory[] = ["brick", "plate", "tile", "slope"];
  return order.map((category) => ({
    category,
    parts: PARTS.filter((p) => p.category === category),
  }));
}
