# Kumitate

A browser-based 3D brick builder you can share with a friend. Open a room, send the link, and
build in the same scene in real time.

**Phase 1 (this milestone) runs locally only** — no accounts, no database, no deploy. See
[`PLAN.md`](./PLAN.md) for the full plan and later phases.

---

## Requirements

- **Node 22+**
- **pnpm** — if you do not have it: `corepack enable pnpm`

No accounts, API keys or paid services are needed. The realtime server runs locally through
`wrangler dev`, which Cloudflare's toolchain provides offline.

## Setup

```bash
pnpm install
```

The first install downloads the `workerd` runtime binary (~100 MB), so give it a minute.

## Run

```bash
pnpm dev
```

That starts both halves together:

| Service  | URL                   | What                          |
| -------- | --------------------- | ----------------------------- |
| web      | http://localhost:3000 | Next.js builder               |
| realtime | http://127.0.0.1:8787 | Yjs rooms on a Durable Object |

Open http://localhost:3000, press **Start building**, then paste the room URL into a second
window to build together.

To point the front end at a deployed worker, set `NEXT_PUBLIC_REALTIME_HOST` (host and port, no
scheme) in `apps/web/.env.local`.

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

The ghost brick follows your cursor, lands on whatever is underneath it, and turns **red** when
it cannot be placed. Click and drag are told apart by how far the pointer travels, so orbiting
the camera never places a brick by accident.

Undo is scoped to you: it will never remove someone else's brick.

## Commands

```bash
pnpm dev         # web + realtime together
pnpm test        # vitest across the workspace (87 tests)
pnpm typecheck   # tsc --noEmit everywhere
pnpm lint        # eslint
pnpm format      # prettier --write
pnpm build       # production build of both apps
```

With the dev servers running, you can also drive three real clients through the live server:

```bash
pnpm --filter @kumitate/realtime sync-check
```

It checks that edits and deletes propagate both ways and that a build survives everyone
disconnecting.

## Layout

```
apps/web/          Next.js App Router builder (React Three Fiber)
apps/realtime/     Cloudflare Worker — Yjs rooms on Durable Objects
packages/brick-core/   Types, part catalogue, colours, grid maths, collision, zod schema
data/              Data platform. Empty until Phase 3.
```

`brick-core` holds everything that is pure logic and is the only place with unit-testable rules.
It has no 3D or React dependencies, because the Worker imports it too.

## How the build is stored

Positions are **integers**: `x`/`z` in studs, `y` in plates, with 1 brick = 3 plates. Floats only
appear in the renderer. That is what keeps two people's concurrent edits from drifting apart.

The build lives in a Yjs document (`doc.getMap("bricks")`), never in React state, so a solo
session and a shared room are the same code path. The Durable Object keeps a snapshot, so a
refresh or a rejoin finds the build still there.

## Known limitations in Phase 1

- **Simultaneous overlapping placement.** Collision is checked when you place a brick, against
  what your client knows at that moment. If two people place overlapping bricks in the same
  instant, both land. Phase 2 adds a deterministic post-merge resolver. This is called out in
  `PLAN.md` section 6 as an accepted soft-start trade-off.
- **Undo can leave a floater.** Undoing a brick that someone else has since built on top of
  removes only yours; the brick above stays where it was.
- **Slope collision is a box.** The 45° slope occupies its full bounding box, so you cannot tuck
  a plate under its overhang.
- Procedural geometry, not real LDraw meshes — that swap is Phase 4.

## Attribution

Part identifiers and dimensions follow the [LDraw](https://www.ldraw.org/) standard, and the
colour palette is taken from LDraw's `LDConfig.ldr`. The LDraw Parts Library is licensed
CC BY 2.0; no LDraw geometry is bundled in Phase 1, since all shapes here are generated
procedurally.

Kumitate (組み立て, "assembly") is not affiliated with, endorsed by, or connected to any toy
manufacturer.
