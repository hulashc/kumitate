/**
 * Where the realtime server lives.
 *
 * The site itself is a static export on GitHub Pages, which cannot hold a WebSocket open. The
 * multiplayer half is a separate Cloudflare Worker, and this is how the two are introduced.
 *
 * Set `NEXT_PUBLIC_REALTIME_HOST` at build time to the deployed worker — host and port only, no
 * scheme, since the client picks `ws://` or `wss://` from the page's own protocol. Locally it
 * defaults to `wrangler dev`, so a fresh clone works with no env file at all.
 */

const CONFIGURED_HOST = process.env.NEXT_PUBLIC_REALTIME_HOST?.trim();

/** The `wrangler dev` default, used when nothing is configured. */
const LOCAL_HOST = "127.0.0.1:8787";

export const REALTIME_HOST =
  CONFIGURED_HOST && CONFIGURED_HOST.length > 0 ? CONFIGURED_HOST : LOCAL_HOST;

/**
 * Kebab-case of the `BuildRoom` Durable Object binding. partyserver derives its route segment
 * from the binding name, so this has to track `apps/realtime/wrangler.jsonc`.
 */
export const REALTIME_PARTY = "build-room";

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * True when the page is deployed somewhere real but still pointing at a local realtime server.
 *
 * Without this check the symptom is miserable to diagnose: the builder loads perfectly, the
 * invite link copies, and nothing ever syncs — because every visitor's browser is dialling
 * their *own* machine on port 8787. Better to say so on screen.
 */
export function isRealtimeMisconfigured(): boolean {
  if (typeof window === "undefined") return false;
  if (isLoopback(window.location.hostname)) return false;

  const host = REALTIME_HOST.split(":")[0] ?? "";
  return isLoopback(host);
}
