"use client";

import { useEffect, useState } from "react";
import type YProvider from "y-partyserver/provider";
import type { Peer, PresenceCursor, PresenceGhost, PresenceState, PresenceUser } from "./presence";

function isPresence(value: unknown): value is PresenceState {
  if (typeof value !== "object" || value === null) return false;
  const user = (value as PresenceState).user;
  return (
    typeof user === "object" &&
    user !== null &&
    typeof user.name === "string" &&
    typeof user.color === "string"
  );
}

/**
 * Everyone else in the room.
 *
 * Excludes the local client — you are shown in the people list separately, and drawing your own
 * ghost twice would just make it look wrong.
 */
export function usePeers(provider: YProvider | null): Peer[] {
  const [peers, setPeers] = useState<Peer[]>([]);

  useEffect(() => {
    if (!provider) {
      setPeers([]);
      return;
    }

    const awareness = provider.awareness;

    const sync = () => {
      const next: Peer[] = [];
      for (const [clientId, state] of awareness.getStates()) {
        if (clientId === awareness.clientID) continue;
        if (!isPresence(state)) continue;
        next.push({
          clientId,
          user: state.user,
          cursor: state.cursor ?? null,
          ghost: state.ghost ?? null,
        });
      }
      next.sort((a, b) => a.clientId - b.clientId);
      setPeers(next);
    };

    sync();
    awareness.on("change", sync);
    return () => awareness.off("change", sync);
  }, [provider]);

  return peers;
}

/** Publish this tab's identity. Safe to call on every render; only writes when it changes. */
export function useLocalPresence(provider: YProvider | null, user: PresenceUser): void {
  useEffect(() => {
    if (!provider) return;
    provider.awareness.setLocalStateField("user", user);
  }, [provider, user]);
}

/** Publish where this tab's ghost brick currently is. */
export function publishGhost(
  provider: YProvider | null,
  cursor: PresenceCursor | null,
  ghost: PresenceGhost | null,
): void {
  if (!provider) return;
  provider.awareness.setLocalStateField("cursor", cursor);
  provider.awareness.setLocalStateField("ghost", ghost);
}
