/**
 * Kumitate realtime server.
 *
 * One Durable Object per build room, holding the authoritative Yjs document and fanning updates
 * out over WebSockets. y-partyserver does the sync protocol and awareness; this file only adds
 * durable persistence so a refresh or a rejoin finds the build still standing.
 */

import * as Y from "yjs";
import { routePartykitRequest } from "partyserver";
import { YServer } from "y-partyserver";

export type Env = {
  BuildRoom: DurableObjectNamespace;
};

/**
 * Durable Object storage caps a single value at 128 KiB. A busy room's Yjs state comfortably
 * exceeds that, so the encoded document is split across numbered chunk keys.
 */
const CHUNK_BYTES = 96 * 1024;
const CHUNK_COUNT_KEY = "doc:chunks";
const chunkKey = (index: number): string => `doc:${index}`;

/** Keys writable in one `storage.put` call. */
const MAX_KEYS_PER_OP = 128;

function toUint8Array(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return null;
}

export class BuildRoom extends YServer<Env> {
  /**
   * How aggressively the document is flushed to storage.
   *
   * Debounced so a burst of placements costs one write, but capped so a user building
   * continuously for a long stretch still gets checkpointed along the way.
   */
  static override callbackOptions = {
    debounceWait: 2_000,
    debounceMaxWait: 10_000,
    timeout: 10_000,
  };

  /** Restore the stored document. Called once, when the first client connects. */
  override async onLoad(): Promise<void> {
    const count = await this.ctx.storage.get<number>(CHUNK_COUNT_KEY);
    if (typeof count !== "number" || count <= 0) return;

    const keys = Array.from({ length: count }, (_, i) => chunkKey(i));
    const stored = await this.ctx.storage.get<ArrayBuffer | Uint8Array>(keys);

    const chunks: Uint8Array[] = [];
    let total = 0;
    for (const key of keys) {
      const chunk = toUint8Array(stored.get(key));
      if (!chunk) {
        // A missing chunk means a half-written snapshot. Applying a truncated update would
        // corrupt the document, so start the room empty rather than wrong.
        console.error(`room ${this.name}: snapshot chunk ${key} missing, discarding snapshot`);
        return;
      }
      chunks.push(chunk);
      total += chunk.byteLength;
    }

    const update = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      update.set(chunk, offset);
      offset += chunk.byteLength;
    }

    Y.applyUpdate(this.document, update);
  }

  /** Persist the document. Called on a debounce after edits, and when the room empties. */
  override async onSave(): Promise<void> {
    const update = Y.encodeStateAsUpdate(this.document);
    const previousCount = (await this.ctx.storage.get<number>(CHUNK_COUNT_KEY)) ?? 0;

    const chunkCount = Math.max(1, Math.ceil(update.byteLength / CHUNK_BYTES));
    const entries: Record<string, Uint8Array> = {};
    for (let i = 0; i < chunkCount; i++) {
      entries[chunkKey(i)] = update.slice(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES);
    }

    // Chunks first, then the count. If the write is interrupted the count still points at the
    // previous complete snapshot rather than a partial new one.
    await this.#putInBatches(entries);
    await this.ctx.storage.put(CHUNK_COUNT_KEY, chunkCount);

    if (previousCount > chunkCount) {
      const stale = Array.from({ length: previousCount - chunkCount }, (_, i) =>
        chunkKey(chunkCount + i),
      );
      await this.ctx.storage.delete(stale);
    }
  }

  async #putInBatches(entries: Record<string, Uint8Array>): Promise<void> {
    const keys = Object.keys(entries);
    for (let i = 0; i < keys.length; i += MAX_KEYS_PER_OP) {
      const batch: Record<string, Uint8Array> = {};
      for (const key of keys.slice(i, i + MAX_KEYS_PER_OP)) {
        batch[key] = entries[key]!;
      }
      await this.ctx.storage.put(batch);
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Plain GET for liveness — handy when checking that `pnpm dev` brought both halves up.
    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "kumitate-realtime" });
    }

    return (await routePartykitRequest(request, env)) ?? new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
