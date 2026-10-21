"use client";

import dynamic from "next/dynamic";
import { useRoomId } from "@/lib/useRoomId";

/**
 * Client-only wrapper around the builder.
 *
 * `ssr: false` is only permitted inside a Client Component, and it is required here: the builder
 * creates a WebGL context and a Yjs doc on mount, neither of which has any meaning at build time.
 */
const Builder = dynamic(() => import("./Builder").then((m) => m.Builder), {
  ssr: false,
  loading: () => <div style={{ padding: "2rem" }}>Loading builder…</div>,
});

export function BuilderClient() {
  const roomId = useRoomId();
  return <Builder roomId={roomId} />;
}
