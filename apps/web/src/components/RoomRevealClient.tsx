"use client";

import dynamic from "next/dynamic";
import { useRoomId } from "@/lib/useRoomId";

/** Client-only, for the same reason as the builder: WebGL and a Yjs doc on mount. */
const RoomReveal = dynamic(() => import("./RoomReveal").then((m) => m.RoomReveal), {
  ssr: false,
  loading: () => <div style={{ padding: "2rem" }}>Loading reveal…</div>,
});

export function RoomRevealClient() {
  const roomId = useRoomId();
  return <RoomReveal roomId={roomId} />;
}
