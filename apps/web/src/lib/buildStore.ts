/**
 * The build document.
 *
 * All build state lives in a Yjs doc — never in React state — so a solo session and a shared
 * room are the same code path (PLAN.md principle 1). `BuildStore` wraps the doc and keeps two
 * derived views in sync incrementally: a plain `Map` of bricks for rendering, and an
 * {@link Occupancy} index for collision and drop tests.
 *
 * Deriving incrementally rather than rebuilding matters: a remote peer placing one brick should
 * cost one index write, not a full rebuild of a 2,000 brick scene.
 *
 * Yjs layout (PLAN.md section 5):
 *   doc.getMap("bricks")  id -> Y.Map { part, color, x, y, z, rot, by }
 *   doc.getMap("meta")    { title, baseplate, createdAt }
 */

import * as Y from "yjs";
import {
  BASEPLATE_SIZE,
  Occupancy,
  type Brick,
  type ConflictLoser,
  type Placement,
  type Rotation,
  getPart,
  resolveConflicts,
  toPlacement,
} from "@kumitate/brick-core";

export const BRICKS_KEY = "bricks";
export const META_KEY = "meta";

/**
 * Origin tag for every transaction this tab makes.
 *
 * `Y.UndoManager` is scoped to this origin, which is the whole mechanism behind "undo only ever
 * undoes my own bricks" — remote updates arrive under a different origin and are never tracked.
 */
export const LOCAL_ORIGIN = Symbol("kumitate.local");

/**
 * Origin for the collision resolver's own deletions.
 *
 * Deliberately *not* tracked by the UndoManager: the resolver is tidying up after the CRDT, not
 * performing a user action, and Ctrl+Z should never resurrect a brick into a space that is
 * already taken.
 */
export const RESOLVER_ORIGIN = Symbol("kumitate.resolver");

export type BuildMetaState = {
  title: string;
  baseplate: number;
};

export function bricksMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>(BRICKS_KEY);
}

export function metaMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap(META_KEY);
}

function isRotation(value: unknown): value is Rotation {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

/**
 * Read one brick out of its Y.Map.
 *
 * Returns `null` rather than throwing on anything malformed. A peer running different code must
 * never be able to crash this client's render loop by writing an unexpected field.
 */
function readBrick(id: string, entry: Y.Map<unknown>): Brick | null {
  const part = entry.get("part");
  const color = entry.get("color");
  const x = entry.get("x");
  const y = entry.get("y");
  const z = entry.get("z");
  const rot = entry.get("rot");
  const by = entry.get("by");

  if (typeof part !== "string" || part.length === 0) return null;
  if (typeof color !== "number" || !Number.isFinite(color)) return null;
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) return null;
  if (!isRotation(rot)) return null;

  return {
    id,
    part,
    color,
    x: x as number,
    y: y as number,
    z: z as number,
    rot,
    by: typeof by === "string" ? by : "",
  };
}

/** Write a brick into the doc as a fresh Y.Map. */
function writeBrick(brick: Brick): Y.Map<unknown> {
  const entry = new Y.Map<unknown>();
  entry.set("part", brick.part);
  entry.set("color", brick.color);
  entry.set("x", brick.x);
  entry.set("y", brick.y);
  entry.set("z", brick.z);
  entry.set("rot", brick.rot);
  entry.set("by", brick.by);
  return entry;
}

type Listener = () => void;

/** A removed brick, plus who had placed it — so a client can tell if it lost one of its own. */
export type ResolvedConflict = ConflictLoser & { by: string };

type ConflictListener = (losers: ResolvedConflict[]) => void;

/**
 * Observable view over a build document.
 *
 * React subscribes through `useSyncExternalStore`, so `getSnapshot` must return a referentially
 * stable array between changes — it is cached and only rebuilt when the doc actually moves.
 */
export class BuildStore {
  readonly doc: Y.Doc;
  readonly undoManager: Y.UndoManager;

  readonly #bricks = new Map<string, Brick>();
  readonly #occupancy = new Occupancy();
  readonly #listeners = new Set<Listener>();
  readonly #conflictListeners = new Set<ConflictListener>();

  /** Set when an incoming change landed on top of an existing brick, arming the resolver. */
  #conflictSuspected = false;
  #resolveScheduled = false;

  #snapshot: Brick[] = [];
  #snapshotDirty = true;
  #metaSnapshot: BuildMetaState = { title: "Untitled build", baseplate: BASEPLATE_SIZE };
  #metaDirty = true;
  #disposed = false;

  readonly #onBricksChanged: (events: Y.YEvent<Y.Map<unknown>>[]) => void;
  readonly #onMetaChanged: () => void;

  constructor(doc: Y.Doc) {
    this.doc = doc;

    const bricks = bricksMap(doc);
    const meta = metaMap(doc);

    // Pick up whatever is already in the doc (a restored snapshot, or sync that landed first).
    for (const [id, entry] of bricks.entries()) this.#upsert(id, entry);

    this.#onBricksChanged = (events) => this.#applyEvents(events);
    this.#onMetaChanged = () => {
      this.#metaDirty = true;
      this.#emit();
    };

    bricks.observeDeep(this.#onBricksChanged);
    meta.observe(this.#onMetaChanged);

    this.undoManager = new Y.UndoManager(bricks, {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
      captureTimeout: 300,
    });
  }

  /** Stop observing. Safe to call twice. */
  destroy(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    bricksMap(this.doc).unobserveDeep(this.#onBricksChanged);
    metaMap(this.doc).unobserve(this.#onMetaChanged);
    this.undoManager.destroy();
    this.#listeners.clear();
    this.#conflictListeners.clear();
  }

  // ---- React integration -------------------------------------------------

  subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  getSnapshot = (): Brick[] => {
    if (this.#snapshotDirty) {
      this.#snapshot = [...this.#bricks.values()];
      this.#snapshotDirty = false;
    }
    return this.#snapshot;
  };

  getMetaSnapshot = (): BuildMetaState => {
    if (this.#metaDirty) {
      const meta = metaMap(this.doc);
      const title = meta.get("title");
      const baseplate = meta.get("baseplate");
      this.#metaSnapshot = {
        title: typeof title === "string" ? title : "Untitled build",
        baseplate: typeof baseplate === "number" ? baseplate : BASEPLATE_SIZE,
      };
      this.#metaDirty = false;
    }
    return this.#metaSnapshot;
  };

  // ---- Reads -------------------------------------------------------------

  /** Live occupancy index. Mutated in place as the doc changes — never hold a stale copy. */
  get occupancy(): Occupancy {
    return this.#occupancy;
  }

  get count(): number {
    return this.#bricks.size;
  }

  getBrick(id: string): Brick | undefined {
    return this.#bricks.get(id);
  }

  // ---- Writes ------------------------------------------------------------

  /** Add a brick under the local origin, so it lands in this tab's undo stack. */
  addBrick(brick: Brick): void {
    this.doc.transact(() => {
      bricksMap(this.doc).set(brick.id, writeBrick(brick));
    }, LOCAL_ORIGIN);
  }

  /**
   * Add several bricks as one undoable step.
   *
   * Stamping a template should be a single Ctrl+Z, not ten.
   */
  addBricks(bricks: readonly Brick[]): void {
    if (bricks.length === 0) return;
    this.doc.transact(() => {
      const map = bricksMap(this.doc);
      for (const brick of bricks) map.set(brick.id, writeBrick(brick));
    }, LOCAL_ORIGIN);
  }

  /** Remove a brick. Returns false if it was already gone. */
  removeBrick(id: string): boolean {
    const bricks = bricksMap(this.doc);
    if (!bricks.has(id)) return false;
    this.doc.transact(() => {
      bricks.delete(id);
    }, LOCAL_ORIGIN);
    return true;
  }

  /** Replace the whole build — used by import. One transaction, so undo reverses it in one step. */
  replaceAll(next: readonly Brick[], meta?: Partial<BuildMetaState>): void {
    this.doc.transact(() => {
      const bricks = bricksMap(this.doc);
      bricks.clear();
      for (const brick of next) bricks.set(brick.id, writeBrick(brick));
      if (meta) this.#writeMeta(meta);
    }, LOCAL_ORIGIN);
  }

  /** Delete every brick in one undoable step. */
  clear(): void {
    this.doc.transact(() => {
      bricksMap(this.doc).clear();
    }, LOCAL_ORIGIN);
  }

  setMeta(meta: Partial<BuildMetaState>): void {
    this.doc.transact(() => this.#writeMeta(meta), LOCAL_ORIGIN);
  }

  /** Seed title/baseplate only if the room is brand new, so joiners never clobber them. */
  initialiseMeta(meta: BuildMetaState): void {
    const map = metaMap(this.doc);
    if (map.has("baseplate")) return;
    this.doc.transact(() => {
      map.set("title", meta.title);
      map.set("baseplate", meta.baseplate);
      map.set("createdAt", new Date().toISOString());
    }, LOCAL_ORIGIN);
  }

  undo(): void {
    this.undoManager.undo();
  }

  redo(): void {
    this.undoManager.redo();
  }

  get canUndo(): boolean {
    return this.undoManager.canUndo();
  }

  get canRedo(): boolean {
    return this.undoManager.canRedo();
  }

  // ---- Internals ---------------------------------------------------------

  #writeMeta(meta: Partial<BuildMetaState>): void {
    const map = metaMap(this.doc);
    if (meta.title !== undefined) map.set("title", meta.title);
    if (meta.baseplate !== undefined) map.set("baseplate", meta.baseplate);
  }

  #applyEvents(events: Y.YEvent<Y.Map<unknown>>[]): void {
    const touched = new Set<string>();
    const dropped = new Set<string>();

    for (const event of events) {
      if (event.path.length === 0) {
        for (const [key, change] of event.changes.keys) {
          if (change.action === "delete") dropped.add(key);
          else touched.add(key);
        }
      } else {
        // A field inside one brick changed; re-read that brick whole.
        touched.add(String(event.path[0]));
      }
    }

    const bricks = bricksMap(this.doc);
    for (const id of dropped) this.#remove(id);
    for (const id of touched) {
      const entry = bricks.get(id);
      if (entry) this.#upsert(id, entry);
      else this.#remove(id);
    }

    if (dropped.size > 0 || touched.size > 0) {
      this.#snapshotDirty = true;
      this.#emit();
    }

    if (this.#conflictSuspected) this.#scheduleResolve();
  }

  /**
   * Run the resolver on a microtask rather than inline.
   *
   * We are inside a Yjs observer here, and the resolver writes back to the same map. Deferring
   * keeps that write out of the transaction currently being delivered, and coalesces a burst of
   * incoming updates into a single resolve pass.
   */
  #scheduleResolve(): void {
    if (this.#resolveScheduled || this.#disposed) return;
    this.#resolveScheduled = true;
    queueMicrotask(() => {
      this.#resolveScheduled = false;
      if (!this.#disposed) this.resolveNow();
    });
  }

  /**
   * Remove every brick that lost a collision, and report what went.
   *
   * Every client runs this independently and reaches the same answer, because
   * {@link resolveConflicts} depends only on the merged document. The redundant deletes that
   * results are harmless — deleting an already-deleted key is a no-op in Yjs — and that is a far
   * simpler guarantee than electing one client to do the tidying.
   */
  resolveNow(): ResolvedConflict[] {
    this.#conflictSuspected = false;

    const entries: [string, Placement][] = [];
    for (const [id, brick] of this.#bricks) {
      const part = getPart(brick.part);
      // Unknown parts are excluded for the same reason they are kept out of the index: we cannot
      // agree on a footprint we do not have, so we must not let one decide a conflict.
      if (part) entries.push([id, toPlacement(brick, part)]);
    }

    const losers: ResolvedConflict[] = resolveConflicts(entries).map((loser) => ({
      ...loser,
      // Read the author before the delete, or there is nothing left to attribute.
      by: this.#bricks.get(loser.id)?.by ?? "",
    }));
    if (losers.length === 0) return losers;

    const bricks = bricksMap(this.doc);
    this.doc.transact(() => {
      for (const loser of losers) bricks.delete(loser.id);
    }, RESOLVER_ORIGIN);

    for (const listener of this.#conflictListeners) listener(losers);
    return losers;
  }

  /** Notified whenever the resolver removes bricks. */
  onConflictResolved(listener: ConflictListener): () => void {
    this.#conflictListeners.add(listener);
    return () => {
      this.#conflictListeners.delete(listener);
    };
  }

  #upsert(id: string, entry: Y.Map<unknown>): void {
    const brick = readBrick(id, entry);
    if (!brick) {
      this.#remove(id);
      return;
    }

    this.#bricks.set(id, brick);

    const part = getPart(brick.part);
    if (part) {
      const placement = toPlacement(brick, part);
      // Cheap pre-check: only an actual overlap is worth paying for a full resolve pass.
      if (this.#occupancy.collides(placement, id)) this.#conflictSuspected = true;
      this.#occupancy.add(id, placement);
    } else {
      // An unknown part is still rendered (with a fallback mesh) but is left out of the index —
      // guessing its footprint would make collision answers differ between clients.
      this.#occupancy.remove(id);
    }

    this.#snapshotDirty = true;
  }

  #remove(id: string): void {
    if (this.#bricks.delete(id)) this.#snapshotDirty = true;
    this.#occupancy.remove(id);
  }

  #emit(): void {
    for (const listener of this.#listeners) listener();
  }
}
