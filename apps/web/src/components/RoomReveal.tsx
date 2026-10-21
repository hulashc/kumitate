"use client";

import { useEffect, useState } from "react";
import type { Brick } from "@kumitate/brick-core";
import { useRoom } from "@/lib/useRoom";
import { useBricks, useBuildMeta } from "@/lib/useBuildStore";
import { Reveal } from "./Reveal";
import styles from "./Reveal.module.css";

/**
 * Preview the reveal for a live room.
 *
 * The build is snapshotted once, the first time the room syncs with something in it, and then
 * held still. Letting it track the live document would mean a brick placed mid-animation
 * restarts the sequence under the viewer — and a gift reveal is of a build at a moment in time
 * anyway, which is exactly what the Phase 2 gift flow will hand this component instead.
 */
export function RoomReveal({ roomId }: { roomId: string }) {
  const { room, status } = useRoom(roomId);
  const store = room?.store ?? null;
  const live = useBricks(store);
  const meta = useBuildMeta(store);

  const [snapshot, setSnapshot] = useState<Brick[] | null>(null);

  useEffect(() => {
    if (snapshot !== null) return;
    // Wait for a connection before concluding the room is empty, or we would snapshot nothing
    // and show an empty reveal for a build that simply had not arrived yet.
    if (status !== "connected") return;
    if (live.length === 0) return;
    setSnapshot(live);
  }, [live, status, snapshot]);

  // An empty room never satisfies the condition above, so give it a moment then accept empty.
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (status !== "connected") return;
    const timer = setTimeout(() => setGaveUp(true), 1500);
    return () => clearTimeout(timer);
  }, [status]);

  if (snapshot === null && !gaveUp) {
    return (
      <div className={styles.root}>
        <p className={styles.emptyNote}>Loading the build…</p>
      </div>
    );
  }

  return (
    <Reveal
      bricks={snapshot ?? []}
      title={meta.title}
      baseplateSize={meta.baseplate}
      backHref={`/build/?room=${encodeURIComponent(roomId)}`}
      backLabel="Back to the builder"
    />
  );
}
