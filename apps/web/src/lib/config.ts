/**
 * Where the realtime server lives.
 *
 * Defaults to the local `wrangler dev` address so a fresh clone works with no env file. Set
 * `NEXT_PUBLIC_REALTIME_HOST` (host and port, no scheme — the provider picks ws/wss itself) to
 * point a deployed front end at a deployed worker.
 */
export const REALTIME_HOST = process.env.NEXT_PUBLIC_REALTIME_HOST ?? "127.0.0.1:8787";

/**
 * Kebab-case of the `BuildRoom` Durable Object binding. partyserver derives its route segment
 * from the binding name, so this has to track `apps/realtime/wrangler.jsonc`.
 */
export const REALTIME_PARTY = "build-room";
