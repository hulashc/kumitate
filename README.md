# Kumitate

A browser-based 3D brick builder you can share with a friend. Open a room, send the link, and
build in the same scene in real time. No sign-up, no install.

Built to live as a portfolio piece: a static site on GitHub Pages, embedded as an iframe, with
one small realtime server on Cloudflare's free tier.

---

## Run it locally

Requires **Node 22+** and **pnpm** (`corepack enable pnpm` if you don't have it).

```bash
pnpm install
pnpm dev
```

| Service  | URL                   | What                          |
| -------- | --------------------- | ----------------------------- |
| web      | http://localhost:3000 | the builder                   |
| realtime | http://127.0.0.1:8787 | Yjs rooms on a Durable Object |

Open http://localhost:3000, press **Start building**, then paste the room URL into a second
window to build together.

The first install pulls down the `workerd` runtime binary (~100 MB), so give it a minute.

## Controls

| Action                | Input                                                                   |
| --------------------- | ----------------------------------------------------------------------- |
| Place a brick         | **Left-click**                                                          |
| Remove a brick        | **Right-click** on it, or hover it and press **Delete** / **Backspace** |
| Rotate the next brick | **R**                                                                   |
| Undo / redo           | **Ctrl/Cmd+Z** / **Shift+Ctrl/Cmd+Z**                                   |
| Orbit the camera      | **Left-drag** on empty space                                            |
| Pan                   | **Right-drag**                                                          |
| Zoom                  | **Scroll**                                                              |
| Pick a part/colour    | Bottom toolbar                                                          |
| Stamp a template      | Pick one in the toolbar, then click in the scene (**Esc** cancels)      |

The ghost brick follows your cursor, lands on whatever is underneath it, and turns **red** when
it can't be placed. Click and drag are told apart by pointer travel, so orbiting never places a
brick by accident. Undo is scoped to you and will never remove someone else's brick.

---

## Deploying

Two halves, deployed separately. **Do the worker first** — the site needs its address.

### 1. The realtime server → Cloudflare Workers (free)

```bash
pnpm --filter @kumitate/realtime deploy
```

First run opens a browser to authorise Wrangler. A free account is enough: this uses a
SQLite-backed Durable Object, which is included on the Workers free plan (100k requests/day, no
card required).

Note the deployed address it prints, e.g. `kumitate-realtime.<your-subdomain>.workers.dev`.

### 2. The site → GitHub Pages

1. Push the repo to GitHub.
2. **Settings → Pages → Source → GitHub Actions**.
3. **Settings → Secrets and variables → Actions → Variables**, add:

   | Variable                    | Value                                            |
   | --------------------------- | ------------------------------------------------ |
   | `NEXT_PUBLIC_REALTIME_HOST` | `kumitate-realtime.<your-subdomain>.workers.dev` |

   Host and port only — **no `https://`**. The client picks `ws://` or `wss://` from the page's
   own protocol.

4. Push to `main`. The workflow lints, typechecks, tests, builds and publishes.

`basePath` is worked out automatically: a repo named `kumitate` is served from `/kumitate/`, and
a `<user>.github.io` repo from the root. Override with a `NEXT_PUBLIC_BASE_PATH` variable if you
use a custom domain.

> If you skip step 3, the deployed site loads fine but nothing ever syncs — every visitor's
> browser would be dialling _their own_ machine on port 8787. The builder detects this and shows
> a banner rather than failing silently.

### 3. Embed it

```html
<iframe
  src="https://<user>.github.io/kumitate/build/"
  title="Kumitate — collaborative 3D brick builder"
  width="100%"
  height="720"
  style="border: 1px solid #2c3b4a; border-radius: 12px"
  allow="clipboard-write"
  loading="lazy"
></iframe>
```

- `/build/` drops visitors straight into a fresh room. Use `/` instead if you want the landing
  page with its explanation and controls.
- **`allow="clipboard-write"` matters** — without it the _Copy invite link_ button can't reach
  the clipboard, and falls back to showing the link for manual copying.
- Give it at least ~600px of height; the toolbar and top bar need the room.
- The invite link a visitor copies points at the GitHub Pages URL, not your portfolio page, so
  whoever they send it to lands directly in the builder.

---

## Commands

```bash
pnpm dev         # web + realtime together
pnpm test        # vitest across the workspace (156 tests)
pnpm typecheck   # tsc --noEmit everywhere
pnpm lint        # eslint
pnpm format      # prettier --write
pnpm build       # static export to apps/web/out, plus a worker dry-run
```

With the dev servers running, you can drive real clients through the live server:

```bash
pnpm --filter @kumitate/realtime sync-check
```

It checks that edits and deletes propagate both ways, that a build survives everyone
disconnecting, and that two simultaneous overlapping placements converge to the same result on
both clients.

## Layout

```
apps/web/              Next.js builder (React Three Fiber), static export
apps/realtime/         Cloudflare Worker — Yjs rooms on Durable Objects
packages/brick-core/   Types, catalogue, colours, grid maths, collision, zod schema
```

`brick-core` is all the pure logic and holds every unit-testable rule. It has no 3D or React
dependencies, because the Worker imports it too.

## How it works

Positions are **integers**: `x`/`z` in studs, `y` in plates, 1 brick = 3 plates. Floats only
appear in the renderer. That's what keeps two people's concurrent edits from drifting apart.

The build lives in a Yjs CRDT, never in React state, so a solo session and a shared room are the
same code path. The Durable Object keeps a snapshot, so a room survives everyone closing the tab.

Rooms are a **query parameter** (`/build/?room=xyz`), not a path segment — a static host has no
server to resolve a path a visitor invented.

## Known limitations

- **A simultaneous placement can be taken back off you.** If two people place overlapping bricks
  in the same instant, both land in the CRDT and the resolver then removes one — lowest brick id
  wins. The losing client gets a short explanation. The resolver runs on both the client (for
  instant feedback) and the server (authoritatively), and is a pure function of the merged
  document, so everyone reaches the same answer.
- **Undo can leave a floater.** Undoing a brick someone has since built on top of removes only
  yours.
- **Slope collision is a box.** The 45° slope occupies its full bounding box, so you can't tuck a
  plate under its overhang.
- **Rooms are discoverable by anyone with the link**, and there is no way to delete one. Treat a
  room as public.
- Procedural geometry rather than real LDraw meshes.

## Attribution

Part identifiers and dimensions follow the [LDraw](https://www.ldraw.org/) standard, and the
palette is taken from LDraw's `LDConfig.ldr`. No LDraw geometry is bundled — every shape here is
generated procedurally.

Kumitate (組み立て, "assembly") is not affiliated with, endorsed by, or connected to any toy
manufacturer.
