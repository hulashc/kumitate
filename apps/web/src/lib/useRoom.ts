"use client";

import { useEffect, useState } from "react";
import * as Y from "yjs";
import YProvider from "y-partyserver/provider";
import { BASEPLATE_SIZE } from "@kumitate/brick-core";
import { BuildStore } from "./buildStore";
import { REALTIME_HOST, REALTIME_PARTY } from "./config";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export type Room = {
  store: BuildStore;
  provider: YProvider;
  /** Yjs client id for this tab — stamped onto every brick this tab places. */
  clientId: string;
};

export type RoomState = {
  room: Room | null;
  status: ConnectionStatus;
};

/**
 * Join a build room.
 *
 * Creates the doc, provider and store together and tears all three down when the room changes,
 * so switching rooms can never leave a socket or an observer behind.
 */
export function useRoom(roomId: string): RoomState {
  const [room, setRoom] = useState<Room | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  useEffect(() => {
    const doc = new Y.Doc();
    const provider = new YProvider(REALTIME_HOST, roomId, doc, {
      party: REALTIME_PARTY,
      // Two tabs of the same room in one browser would otherwise sync peer-to-peer over
      // BroadcastChannel. That is faster, but it hides server problems during development and
      // means the two tabs share one awareness view instead of appearing as two builders.
      disableBc: true,
    });

    const store = new BuildStore(doc);
    const onStatus = (event: { status: string }) => {
      if (event.status === "connected") setStatus("connected");
      else if (event.status === "connecting") setStatus("connecting");
      else setStatus("disconnected");
    };
    provider.on("status", onStatus);

    // Seed metadata only once the first sync has landed, so a joiner never writes defaults over
    // a room that already has a title.
    const onSync = (isSynced: boolean) => {
      if (isSynced) store.initialiseMeta({ title: "Untitled build", baseplate: BASEPLATE_SIZE });
    };
    provider.on("sync", onSync);

    setRoom({ store, provider, clientId: String(doc.clientID) });

    return () => {
      provider.off("status", onStatus);
      provider.off("sync", onSync);
      store.destroy();
      provider.destroy();
      doc.destroy();
      setRoom(null);
      setStatus("connecting");
    };
  }, [roomId]);

  return { room, status };
}
