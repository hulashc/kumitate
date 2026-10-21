"use client";

import { useState } from "react";
import { nanoid } from "nanoid";

/** Query parameter carrying the room id. */
export const ROOM_PARAM = "room";

/** Length of a generated room id. Long enough that rooms are not guessable by typing. */
const ROOM_ID_LENGTH = 10;

export function newRoomId(): string {
  return nanoid(ROOM_ID_LENGTH);
}

/**
 * Room ids come from the query string because the site is a static export — there is no server
 * to resolve `/build/<anything>`, and room ids are invented by visitors, so they can never be
 * pre-rendered.
 *
 * Read straight from `window.location` rather than `useSearchParams`, which would need a
 * Suspense boundary for no benefit: every caller is already inside a client-only component.
 */
export function readRoomIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get(ROOM_PARAM);
  return value && value.length > 0 ? value : null;
}

/**
 * The absolute link to share for a room.
 *
 * Built from this page's own origin and path, which is the right answer even when the app is
 * running inside an iframe on someone's portfolio: `window.location` there is the embedded app's
 * URL, so the recipient gets the builder directly rather than a page they would have to scroll
 * to find. The parent page's URL is not readable cross-origin anyway.
 */
export function inviteUrl(roomId: string): string {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = "";
  url.searchParams.set(ROOM_PARAM, roomId);
  return url.toString();
}

/**
 * The current room, minting one if the URL has none.
 *
 * A fresh id is written back with `replaceState` so the address bar always shows a shareable
 * link — without it, someone landing on a bare `/build/` would have nothing to copy to a friend.
 * `replaceState` rather than `pushState` so Back still leaves the builder.
 */
export function useRoomId(): string {
  const [roomId] = useState(() => {
    const existing = readRoomIdFromUrl();
    if (existing) return existing;

    const fresh = newRoomId();
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set(ROOM_PARAM, fresh);
      window.history.replaceState(null, "", url.toString());
    }
    return fresh;
  });

  return roomId;
}
