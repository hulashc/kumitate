/**
 * Who else is in the room.
 *
 * Presence rides on Yjs awareness, which is ephemeral: it is not part of the document, never
 * persists, and clears automatically when a tab goes away. Shape follows PLAN.md section 5.
 */

import type { Rotation } from "@kumitate/brick-core";

export type PresenceCursor = {
  /** Grid coordinates, matching the document's integer convention. */
  x: number;
  y: number;
  z: number;
};

export type PresenceGhost = {
  part: string;
  color: number;
  rot: Rotation;
};

export type PresenceUser = {
  name: string;
  /** Hex colour identifying this person, distinct from any brick colour. */
  color: string;
};

export type PresenceState = {
  user: PresenceUser;
  cursor: PresenceCursor | null;
  ghost: PresenceGhost | null;
};

export type Peer = {
  clientId: number;
  user: PresenceUser;
  cursor: PresenceCursor | null;
  ghost: PresenceGhost | null;
};

/**
 * Presence colours, deliberately not drawn from the LDraw palette — a cursor must never be
 * mistaken for a brick.
 */
const PRESENCE_COLORS = [
  "#FF6B9D",
  "#4DD0E1",
  "#FFB74D",
  "#9575CD",
  "#4DB6AC",
  "#F06292",
  "#7986CB",
  "#AED581",
] as const;

const ADJECTIVES = [
  "Brisk",
  "Clever",
  "Sunny",
  "Quiet",
  "Nimble",
  "Bold",
  "Merry",
  "Keen",
  "Lively",
  "Gentle",
] as const;

const NOUNS = [
  "Otter",
  "Finch",
  "Maple",
  "Comet",
  "Pebble",
  "Lantern",
  "Willow",
  "Harbour",
  "Meadow",
  "Sparrow",
] as const;

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

export function randomIdentity(): PresenceUser {
  return { name: `${pick(ADJECTIVES)} ${pick(NOUNS)}`, color: pick(PRESENCE_COLORS) };
}

const STORAGE_KEY = "kumitate.identity";

/**
 * Load this browser's name and colour, inventing one on first visit.
 *
 * Stored in `localStorage` so the same person keeps their name across refreshes — but each tab
 * still gets its own awareness entry, which is what makes two windows read as two builders.
 */
export function loadIdentity(): PresenceUser {
  if (typeof window === "undefined") return randomIdentity();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        typeof (parsed as PresenceUser).name === "string" &&
        typeof (parsed as PresenceUser).color === "string"
      ) {
        return parsed as PresenceUser;
      }
    }
  } catch {
    // Corrupt or blocked storage is not worth failing a room join over.
  }

  const fresh = randomIdentity();
  saveIdentity(fresh);
  return fresh;
}

export function saveIdentity(user: PresenceUser): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } catch {
    // Private browsing can refuse writes; presence still works for this session.
  }
}
