"use client";

import dynamic from "next/dynamic";

/**
 * Client-only wrapper around the builder.
 *
 * `ssr: false` is only permitted inside a Client Component, and it is required here: the builder
 * creates a WebGL context and a Yjs doc on mount, neither of which has any meaning on the server.
 */
const Builder = dynamic(() => import("./Builder").then((m) => m.Builder), {
  ssr: false,
  loading: () => <div className="loading">Loading builder…</div>,
});

export function BuilderClient({ roomId }: { roomId: string }) {
  return <Builder roomId={roomId} />;
}
