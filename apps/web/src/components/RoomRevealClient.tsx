"use client";

import dynamic from "next/dynamic";

/** Client-only, for the same reason as the builder: WebGL and a Yjs doc on mount. */
const RoomReveal = dynamic(() => import("./RoomReveal").then((m) => m.RoomReveal), {
  ssr: false,
  loading: () => <div style={{ padding: "2rem" }}>Loading reveal…</div>,
});

export function RoomRevealClient({ roomId }: { roomId: string }) {
  return <RoomReveal roomId={roomId} />;
}
