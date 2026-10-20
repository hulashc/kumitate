/**
 * End-to-end check against a running realtime server.
 *
 * Verifies the two things Phase 1 is judged on that a unit test cannot reach: an edit in one
 * client shows up in another, and the build survives everyone leaving and coming back.
 *
 * Usage: start the worker (`pnpm dev`, or `wrangler dev` in this package), then
 *   node scripts/sync-check.mjs [host]
 * Host defaults to 127.0.0.1:8787.
 */

import * as Y from "yjs";
import YProvider from "y-partyserver/provider";

const HOST = process.argv[2] ?? "127.0.0.1:8787";
const PARTY = "build-room";
const ROOM = `sync-check-${process.pid}-${Date.now()}`;

const SYNC_TIMEOUT_MS = 15_000;
/** Must exceed the server's onSave debounceWait so the snapshot is actually on disk. */
const SAVE_GRACE_MS = 4_000;

function connect(label) {
  const doc = new Y.Doc();
  const provider = new YProvider(HOST, ROOM, doc, {
    party: PARTY,
    // Without this, two docs in one process sync via BroadcastChannel and the test would pass
    // even with the server switched off.
    disableBc: true,
  });
  provider.on("connection-error", (event) => {
    console.error(`  [${label}] connection error:`, event?.message ?? event);
  });
  return { doc, provider, label };
}

function waitForSync(client) {
  return new Promise((resolve, reject) => {
    if (client.provider.synced) {
      resolve();
      return;
    }
    const timer = setTimeout(
      () => reject(new Error(`[${client.label}] did not sync within ${SYNC_TIMEOUT_MS}ms`)),
      SYNC_TIMEOUT_MS,
    );
    client.provider.on("sync", (isSynced) => {
      if (!isSynced) return;
      clearTimeout(timer);
      resolve();
    });
  });
}

/** Resolve once `predicate` holds, re-checking whenever the doc changes. */
function waitFor(doc, predicate, description) {
  return new Promise((resolve, reject) => {
    const check = () => {
      if (!predicate()) return false;
      cleanup();
      resolve();
      return true;
    };
    const cleanup = () => {
      clearTimeout(timer);
      doc.off("update", check);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timed out waiting for ${description}`));
    }, SYNC_TIMEOUT_MS);

    doc.on("update", check);
    check();
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readBrick(doc, id) {
  const entry = doc.getMap("bricks").get(id);
  if (!entry) return null;
  return {
    part: entry.get("part"),
    color: entry.get("color"),
    x: entry.get("x"),
    y: entry.get("y"),
    z: entry.get("z"),
    rot: entry.get("rot"),
    by: entry.get("by"),
  };
}

function placeBrick(doc, id, fields) {
  doc.transact(() => {
    const entry = new Y.Map();
    for (const [key, value] of Object.entries(fields)) entry.set(key, value);
    doc.getMap("bricks").set(id, entry);
  });
}

const BRICK = { part: "3001", color: 4, x: 5, y: 0, z: 7, rot: 1, by: "sync-check" };

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.error(`  FAIL  ${label}`);
    failures++;
  }
}

async function main() {
  console.log(`Room ${ROOM} on ${HOST}\n`);

  console.log("1. two clients in one room");
  const alice = connect("alice");
  await waitForSync(alice);
  placeBrick(alice.doc, "brick-1", BRICK);

  const bob = connect("bob");
  await waitForSync(bob);
  await waitFor(
    bob.doc,
    () => readBrick(bob.doc, "brick-1") !== null,
    "alice's brick to reach bob",
  );
  check(
    "bob receives a brick placed by alice",
    JSON.stringify(readBrick(bob.doc, "brick-1")) === JSON.stringify(BRICK),
  );

  console.log("\n2. edits flow both ways");
  placeBrick(bob.doc, "brick-2", { ...BRICK, x: 9, color: 14 });
  await waitFor(
    alice.doc,
    () => readBrick(alice.doc, "brick-2") !== null,
    "bob's brick to reach alice",
  );
  check("alice receives a brick placed by bob", readBrick(alice.doc, "brick-2")?.color === 14);

  console.log("\n3. deletions propagate");
  bob.doc.transact(() => bob.doc.getMap("bricks").delete("brick-1"));
  await waitFor(
    alice.doc,
    () => readBrick(alice.doc, "brick-1") === null,
    "the delete to reach alice",
  );
  check("alice sees bob's delete", readBrick(alice.doc, "brick-1") === null);

  console.log("\n4. the room persists after everyone leaves");
  alice.provider.destroy();
  bob.provider.destroy();
  await sleep(SAVE_GRACE_MS);

  const carol = connect("carol");
  await waitForSync(carol);
  await waitFor(
    carol.doc,
    () => readBrick(carol.doc, "brick-2") !== null,
    "the stored build to load",
  );
  check("a fresh client loads the stored build", readBrick(carol.doc, "brick-2")?.color === 14);
  check("the deleted brick stays deleted", readBrick(carol.doc, "brick-1") === null);
  check("brick count is correct after reload", carol.doc.getMap("bricks").size === 1);
  carol.provider.destroy();

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nsync-check failed:", error.message);
  process.exit(1);
});
