import { beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { getPart, type Brick } from "@kumitate/brick-core";
import { BuildStore } from "./buildStore";

/**
 * These tests exercise the real `BuildStore` against two genuinely separate Yjs documents wired
 * together the way the provider wires them — updates crossing with a non-local origin. That is
 * the only honest way to check "undo never touches someone else's brick", because the behaviour
 * depends entirely on how the UndoManager's tracked origins are configured.
 */

function brick(id: string, by: string, overrides: Partial<Brick> = {}): Brick {
  return { id, part: "3001", color: 4, x: 0, y: 0, z: 0, rot: 0, by, ...overrides };
}

/** Relay updates between two docs, tagging them with a non-local origin on arrival. */
function connect(a: Y.Doc, b: Y.Doc): void {
  a.on("update", (update: Uint8Array, origin: unknown) => {
    if (origin === "remote") return;
    Y.applyUpdate(b, update, "remote");
  });
  b.on("update", (update: Uint8Array, origin: unknown) => {
    if (origin === "remote") return;
    Y.applyUpdate(a, update, "remote");
  });
}

describe("BuildStore across two clients", () => {
  let docA: Y.Doc;
  let docB: Y.Doc;
  let alice: BuildStore;
  let bob: BuildStore;

  beforeEach(() => {
    docA = new Y.Doc();
    docB = new Y.Doc();
    connect(docA, docB);
    alice = new BuildStore(docA);
    bob = new BuildStore(docB);
  });

  it("propagates a placement to the other client", () => {
    alice.addBrick(brick("a1", "alice"));
    expect(bob.count).toBe(1);
    expect(bob.getBrick("a1")?.by).toBe("alice");
  });

  it("propagates a deletion", () => {
    alice.addBrick(brick("a1", "alice"));
    alice.removeBrick("a1");
    expect(bob.count).toBe(0);
    expect(bob.getBrick("a1")).toBeUndefined();
  });

  it("keeps the occupancy index in step on the receiving client", () => {
    alice.addBrick(brick("a1", "alice", { x: 4, z: 4 }));
    expect(bob.occupancy.size).toBe(1);
    expect(bob.occupancy.at(4, 0, 4)).toBe("a1");
    expect(bob.occupancy.columnTop(4, 4)).toBe(3);

    alice.removeBrick("a1");
    expect(bob.occupancy.size).toBe(0);
    expect(bob.occupancy.columnTop(4, 4)).toBe(0);
  });

  describe("undo is scoped to the local client", () => {
    beforeEach(() => {
      alice.addBrick(brick("a1", "alice", { x: 0, z: 0 }));
      bob.addBrick(brick("b1", "bob", { x: 8, z: 8 }));
      expect(alice.count).toBe(2);
      expect(bob.count).toBe(2);
    });

    it("lets alice undo only her own brick", () => {
      alice.undo();
      expect(alice.getBrick("a1")).toBeUndefined();
      expect(alice.getBrick("b1")).toBeDefined();
      expect(bob.getBrick("b1")).toBeDefined();
    });

    it("gives alice nothing left to undo after her one action", () => {
      alice.undo();
      expect(alice.canUndo).toBe(false);
      // Bob's brick is still there and alice cannot reach it however hard she tries.
      alice.undo();
      expect(alice.getBrick("b1")).toBeDefined();
    });

    it("lets each client undo independently", () => {
      alice.undo();
      bob.undo();
      expect(alice.count).toBe(0);
      expect(bob.count).toBe(0);
    });

    it("does not let alice undo a deletion made by bob", () => {
      bob.removeBrick("a1");
      expect(alice.getBrick("a1")).toBeUndefined();

      // Alice's only undoable action is still her own placement, which bob has since removed.
      alice.undo();
      expect(alice.getBrick("a1")).toBeUndefined();
      expect(alice.getBrick("b1")).toBeDefined();
    });

    it("redoes the local action it just undid", () => {
      alice.undo();
      expect(alice.getBrick("a1")).toBeUndefined();
      alice.redo();
      expect(alice.getBrick("a1")).toBeDefined();
      expect(bob.getBrick("a1")).toBeDefined();
    });
  });

  it("treats an import as a single undoable step", () => {
    alice.addBrick(brick("a1", "alice"));
    alice.undoManager.stopCapturing();

    alice.replaceAll([brick("i1", "alice", { x: 2 }), brick("i2", "alice", { x: 4 })], {
      title: "Imported",
      baseplate: 32,
    });
    expect(alice.count).toBe(2);
    expect(bob.count).toBe(2);

    alice.undo();
    expect(alice.getBrick("a1")).toBeDefined();
    expect(alice.getBrick("i1")).toBeUndefined();
    expect(alice.count).toBe(1);
  });

  it("ignores a malformed brick written by a peer rather than crashing", () => {
    docB.transact(() => {
      const entry = new Y.Map<unknown>();
      entry.set("part", "3001");
      entry.set("color", 4);
      entry.set("x", 1.5); // not an integer
      entry.set("y", 0);
      entry.set("z", 0);
      entry.set("rot", 0);
      entry.set("by", "bob");
      docB.getMap("bricks").set("bad", entry);
    });

    expect(alice.count).toBe(0);
    expect(alice.getSnapshot()).toEqual([]);
  });

  it("leaves a brick out of the occupancy index when its part is unknown", () => {
    docB.transact(() => {
      const entry = new Y.Map<unknown>();
      entry.set("part", "not-a-real-part");
      entry.set("color", 4);
      entry.set("x", 0);
      entry.set("y", 0);
      entry.set("z", 0);
      entry.set("rot", 0);
      entry.set("by", "bob");
      docB.getMap("bricks").set("mystery", entry);
    });

    // Still rendered (with a fallback shape), but it must not influence collision answers,
    // which would otherwise differ between clients with different catalogues.
    expect(alice.count).toBe(1);
    expect(alice.occupancy.size).toBe(0);
  });

  it("shares metadata between clients", () => {
    alice.setMeta({ title: "Bouquet" });
    expect(bob.getMetaSnapshot().title).toBe("Bouquet");
  });

  it("does not overwrite metadata when a second client initialises", () => {
    alice.initialiseMeta({ title: "First", baseplate: 32 });
    bob.initialiseMeta({ title: "Second", baseplate: 48 });
    expect(alice.getMetaSnapshot().title).toBe("First");
    expect(bob.getMetaSnapshot().baseplate).toBe(32);
  });

  it("returns a stable snapshot reference until the document changes", () => {
    alice.addBrick(brick("a1", "alice"));
    const first = alice.getSnapshot();
    expect(alice.getSnapshot()).toBe(first);

    alice.addBrick(brick("a2", "alice", { x: 6 }));
    expect(alice.getSnapshot()).not.toBe(first);
  });
});

describe("catalogue assumptions the store relies on", () => {
  it("resolves the default part used by placement", () => {
    expect(getPart("3001")).toBeDefined();
  });
});
