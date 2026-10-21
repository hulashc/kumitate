# Kumitate — Project Plan

> Kumitate (組み立て, "assembly"). Never use "LEGO" in the product name, logo or domain.

This file is the source of truth for the project. Claude Code reads it at the start of every session and updates the Progress Log at the end of every session.

---

## 1. Vision

A browser-based 3D brick builder where two or more people build together in the same scene, in
real time. It should be simpler than any existing brick CAD tool: someone who has never used 3D
software should be able to build a flower in five minutes.

**One use case: share a link, a friend joins, you both place bricks in the same scene live.**
No sign-up, no install, no account.

It ships as a **portfolio piece on hulash.com** — a static page on GitHub Pages, embedded in the
site as an iframe, backed by one small realtime server on Cloudflare's free tier.

What it is deliberately _not_: an account system, a social network, a gift shop, or a data
platform. An earlier version of this plan had all four. See §6a.

## 2. Principles

1. **Multiplayer-first.** Build state is a CRDT (Yjs) from day one. A solo session is just a room with one person.
2. **Simplicity over power.** Small curated palette, forgiving snapping, unlimited undo. Every feature must pass the "five-minute flower" test.
3. **Free to run, forever, unattended.** Free tiers only, and nothing that depends on a machine being switched on. The site has to work at 3am when a stranger clicks the portfolio link.
4. **No accounts.** The URL is the only identity. If a feature needs a login, it is the wrong feature for this project.
5. **Integer grid.** Brick positions are stored as integer grid coordinates, never floats, so concurrent edits never drift.

## 3. Architecture

Two pieces, both on free tiers, no database anywhere.

```
   hulash.com                      GitHub Pages                  Cloudflare Workers
  ┌─────────────┐   iframe        ┌──────────────────┐   wss    ┌───────────────────┐
  │ portfolio   │────────────────▶│ Kumitate         │─────────▶│ BuildRoom         │
  │ page        │                 │ static export    │          │ Durable Object    │
  └─────────────┘                 │ Next.js + R3F    │◀─────────│ one per room id   │
                                  │ (apps/web)       │  sync +  │ (apps/realtime)   │
                                  └──────────────────┘ presence └───────────────────┘
                                                                  Yjs doc + snapshot
                                                                  in DO SQLite storage
```

**Why the split:** GitHub Pages cannot hold a WebSocket open, and multiplayer needs one. So the
page is static and the ~150 lines that need a server live in a Worker. SQLite-backed Durable
Objects are on the Workers free plan (100k requests/day), which is what makes this cost nothing.

The build state is a Yjs CRDT; the Durable Object stores a snapshot so a room survives everyone
closing the tab. That is the entire backend.

### Tech decisions

| Area               | Choice                                      | Why                                                                          | Alternative considered               |
| ------------------ | ------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------ |
| App language       | TypeScript (strict)                         | One language across web + realtime                                           | Python backend (kept for data layer) |
| Frontend           | Next.js (App Router), static export         | Matches hulash.com; `output: "export"` gives a folder GitHub Pages can serve | Vite SPA                             |
| Hosting            | GitHub Pages                                | Free, same repo as the code, embeds cleanly in an iframe                     | Vercel                               |
| 3D                 | three.js via React Three Fiber + drei       | Mature, LDraw loader available                                               | Babylon.js                           |
| Multiplayer state  | Yjs (CRDT) + awareness                      | Conflict-free concurrent edits, presence built in                            | Liveblocks (paid tiers)              |
| Realtime transport | y-partyserver on Cloudflare Durable Objects | Free tier, same code local and deployed                                      | Self-hosted y-websocket              |
| Local UI state     | Zustand                                     | Small, simple                                                                | Redux                                |
| Persistence        | Durable Object SQLite storage               | The only storage the product needs; no database to run or pay for            | Supabase, Postgres                   |
| Brick geometry     | Procedural                                  | Keyed by LDraw IDs, so real meshes remain a drop-in later                    | LDraw meshes from day one            |
| Build portability  | Versioned JSON export/import                | Replaces "saved builds" without an account or a backend                      | Server-side saved builds             |

## 4. Repository structure

```
/
├── PLAN.md                  ← this file
├── CLAUDE.md                ← short pointer to PLAN.md + working rules
├── package.json             ← pnpm workspaces
├── apps/
│   ├── web/                 ← Next.js app, static export → GitHub Pages
│   └── realtime/            ← Cloudflare Worker, Yjs rooms on Durable Objects
├── packages/
│   └── brick-core/          ← shared types, part catalogue, colours, grid math, collision, schema
└── .github/workflows/       ← lint, typecheck, test, build, publish to Pages
```

## 5. Core data model

### Units

LDraw units (LDU): 1 stud = 20 LDU wide, 1 brick = 24 LDU tall, 1 plate = 8 LDU tall.
Grid: x/z in studs, y in plates (1 brick = 3 plates). All integers.

### Brick (in the Yjs document)

```ts
type Brick = {
  id: string; // nanoid
  part: string; // LDraw part ID, e.g. "3001" (Brick 2x4)
  color: number; // LDraw colour code, e.g. 4 (Red)
  x: number; // studs, integer
  y: number; // plates, integer (0 = sits on baseplate)
  z: number; // studs, integer
  rot: 0 | 1 | 2 | 3; // quarter turns around Y
  by: string; // clientId of the placer (for undo + attribution)
};
```

Yjs layout: `doc.getMap("bricks")` keyed by brick id → `Y.Map` of the fields above. `doc.getMap("meta")` for title, created time, baseplate size.

### Presence (Yjs awareness)

`{ name, color, cursor: {x,y,z} | null, ghost: { part, color, rot } | null }`

### Persistence

There is no database. The Durable Object keeps the room's Yjs state as a chunked snapshot in its
own SQLite storage, so a room survives everyone closing the tab. Chunked because a single
Durable Object storage value is capped at 128 KiB and a busy room exceeds that.

Anything a person wants to keep, they export as JSON.

## 6. Phases

### Phase 1 — Soft start: multiplayer builder core (local only)

Goal: two browser windows on one machine, building together in the same scene.

- [x] pnpm monorepo with `apps/web`, `apps/realtime`, `packages/brick-core`
- [x] Part catalogue (~16 parts) with procedural geometry: box body + cylinder studs, keyed by LDraw ID
- [x] Colour palette (~12 LDraw colours)
- [x] Baseplate (32×32), orbit camera, soft lighting
- [x] Place brick: hover shows ghost brick snapped to the grid, click to place on baseplate or on top of studs
- [x] Rotate (R), delete (Delete/Backspace or right-click), pick colour, pick part
- [x] Collision check: can't place overlapping bricks
- [x] Yjs room per URL `/build/[roomId]`, landing page creates a room
- [x] Presence: names, colours, live cursors and ghost bricks of others
- [x] Per-user undo/redo (Yjs UndoManager scoped to local origin)
- [x] Persistence in the Durable Object (refresh keeps the build)
- [x] Export / import build as JSON
- [x] Unit tests for grid maths and collision (vitest)
- [x] One command to run everything locally: `pnpm dev`

**Done when:** two windows on the same room see each other's bricks and cursors within a blink, undo only undoes your own actions, and a refresh keeps the build.

**Known soft-start limitation:** if two people place overlapping bricks in the same instant, both may land. Acceptable for now; Phase 2 adds a deterministic post-merge resolver.

### Phase 2 — Ship it as a portfolio piece

**Scope was cut here (2026-10-21).** The original Phase 2–5 plan — accounts, a gift flow,
Supabase, the data platform, a social feed, recommendations — is **dropped**. The project is now
exactly what its one-line description says: share a link, build together. Anything that does not
serve that is out.

See §6a for what was cut and why, and §10 for the ideas kept on ice.

- [x] Templates: flower stem, heart, card frame
- [x] Concurrent-collision resolver
- [x] Reveal animation (`/reveal/?room=…`) — kept purely because it looks good on a portfolio page
- [x] Static export for GitHub Pages (`output: "export"`, configurable `basePath`)
- [x] Rooms moved from `/build/[roomId]` to `/build/?room=…` — a static host cannot resolve a
      path segment invented by a visitor
- [x] GitHub Actions workflow: lint, typecheck, test, build, publish to Pages
- [x] Deploy the realtime worker to Cloudflare — `kumitate-realtime.kumitate-realtime.workers.dev`
- [x] Set `NEXT_PUBLIC_REALTIME_HOST` repo variable to the deployed worker
- [x] Embed on hulash.com as an iframe — entry added to `portfolio_nextjs/src/data/projects.ts`

**Live:** <https://hulashc.github.io/kumitate/> · repo <https://github.com/hulashc/kumitate>

**Done when:** a stranger can open the embedded builder on the portfolio site, press _Start
building_, send the link to a friend, and the two of them build together.

### 6a. What was cut, and why

| Cut                                                 | Why                                                                                                       |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Supabase, accounts, magic-link auth                 | A shared link is the only identity the product needs. An account is a wall in front of a toy.             |
| Saved builds, "my builds"                           | Needs accounts. Export/import JSON covers the same need with no backend.                                  |
| Gift flow + stored letters                          | Needs a database. The reveal animation survives; the storage does not.                                    |
| Vercel                                              | GitHub Pages hosts a static export for free and keeps the whole thing in one repo.                        |
| Rebrickable pipeline, parts list, BrickLink export  | Phase 3's entire reason was the data-platform portfolio angle. Different project.                         |
| Social feed, likes, comments                        | Needs accounts and moderation. Not a toy any more.                                                        |
| Debezium / Redpanda / Spark / Delta / Airflow / dbt | Same. A laptop-only data platform cannot back a site that must work when the laptop is off (principle 4). |
| Databricks recommendations                          | Nothing to recommend without a feed.                                                                      |

The one thing genuinely lost is server-side persistence of _named_ builds. Rooms still persist in
the Durable Object, and anyone can export a build to JSON, so nothing is unrecoverable.

## 7. Legal and attribution

- No "LEGO" in the product name, logo or domain.
- Part identifiers, dimensions and colours follow the LDraw standard; the palette comes from
  `LDConfig.ldr`. Credit LDraw. The parts library is CC BY 2.0 — relevant only if real LDraw
  meshes are ever bundled, which Phase 1's procedural geometry avoids.

## 8. Open questions

- Max players per room (start: 8 — untested above 2)
- Should the embedded version hide the landing page and drop you straight into a room?

## 9. On ice

Not planned, but worth remembering they were considered and why they would be cheap or
expensive to revive:

- **LDraw meshes instead of procedural geometry.** Cheap — the catalogue is already keyed by
  LDraw part ID specifically so this is a swap, not a rewrite. Pure client-side.
- **More parts and colours.** Cheap. Add rows to `parts.ts` / `colors.ts`; the tests enforce
  that every entry is real and every template still builds.
- **Bigger or resizable baseplate.** Cheap — `baseplate` is already in the room metadata and
  every bounds check reads it.
- **Parts list panel** (counts per part and colour). Cheap and genuinely useful; needs no
  Rebrickable pipeline, just a tally of the Yjs doc. The BrickLink export would need the legacy
  IDs already recorded in `aliases`.
- **Saved/named builds, gift letters, a feed.** Expensive — all need accounts and a database,
  which is exactly what this scope cut removed.

## 10. Progress log

Claude Code appends one entry per session: date, what was done, what's next, any decisions made.

### 2026-10-21 — Phase 1 built

**Done.** All of Phase 1. pnpm monorepo (strict TS, ESLint, Prettier); `brick-core` with the
16-part catalogue, 12-colour palette, integer grid maths, occupancy/collision index and a
versioned zod build schema; `apps/web` builder on React Three Fiber; `apps/realtime` Yjs rooms on
Durable Objects; rooms, live sync, presence, per-user undo, persistence, JSON export/import.
87 vitest tests pass, plus an end-to-end `sync-check` script that drives three real clients
through the running worker.

**Decisions made.**

- **Two LDraw part IDs in the brief were stale** and are corrected in the catalogue: Plate 1x2 is
  `3023b` (`3023` was moved 2024-07) and Plate 1x1 Round is `6141` (`4073` was moved 2025-04).
  Both verified against `library.ldraw.org`. The catalogue keys on the canonical ID and keeps the
  legacy ID in `aliases`, because BrickLink still uses the old numbers and Phase 3's Wanted List
  export will need them. All 12 colours were verified against `LDConfig.ldr`.
- **Bricks store their minimum corner, not their centre**, so the occupied volume is an exact
  integer box and rotation never introduces a half-stud.
- **Placement is column-drop, not face-normal.** The ghost lands on the highest thing under its
  footprint rather than attaching to the face you pointed at. Much more forgiving, and it is what
  makes the five-minute-flower test survive contact with a trackpad.
- **One `InstancedMesh` per part with per-instance colour**, rather than per part × colour. Keeps
  the scene at ~16 draw calls instead of up to 192.
- **Hover highlight is a separate outline mesh**, not an instance tint, so moving the pointer
  never rewrites the instance buffers.
- **`@cloudflare/workers-types` pinned to v5** to match the installed `workerd`. `y-partyserver`'s
  `^4` peer range is stale; the resulting install warning is expected and documented in CLAUDE.md.
- **TypeScript held at 5.9** rather than the newly released 7.0 — the Go port's ecosystem support
  (typescript-eslint, Next) is still settling and this was not the place to debug it.

**Not done / deferred.** The 3D scene itself has not been verified in a browser by the agent —
build, typecheck, lint, unit tests and the networked sync check all pass, but visual and
interaction behaviour needs the manual test script in the handover.

**Next.** Await feedback on the manual test pass, then Phase 2 (gifting, accounts, deploy),
starting with the concurrent-collision resolver noted above.

### 2026-10-21 — Phase 2, the half that needs no accounts

Phase 1 confirmed working in the browser. Built the three Phase 2 items that have no external
dependencies, so the Supabase/Vercel/Cloudflare signups can happen in parallel.

**Done.**

- **Concurrent-collision resolver.** `resolveConflicts()` in brick-core: sort by brick id, replay
  into a fresh occupancy index, drop what cannot fit.
- **Templates.** Flower, heart and card frame, armed from the toolbar and stamped as one
  undoable step.
- **Reveal animation.** `Reveal` / `RevealScene` components plus a live preview route at
  `/build/[roomId]/reveal`. Ready for the gift flow to hand it a stored snapshot and a letter.

**Decisions made.**

- **The resolver runs in two places.** The client runs it for instant feedback and tells you when
  one of your own bricks lost; the Durable Object runs it authoritatively. Client-side alone
  would mean any client that does not implement it leaves a room inconsistent forever. Both are
  the same pure function, so the duplicated deletes are harmless.
- **Lowest brick id wins, not oldest.** A conflict that survives to the merge is by definition
  concurrent — anything non-concurrent was already refused at placement time — so there is no
  meaningful "older". An arbitrary but stable tiebreak is the honest choice, and the rule has to
  be a pure function of the merged document or clients would never converge.
- **Reveal order is bottom-up, not placement order.** `Brick` has no timestamp, and adding one
  would record the wall clock of whichever client placed it: not comparable between people and
  not stable across an export/import. Bottom-up is derivable from the build, identical for
  everyone, and reads better — a build that rises from the baseplate looks constructed.
- **The Worker imports brick-core by subpath.** The barrel re-exports the zod schema, which
  tripled the Worker bundle.

**Bug found and fixed.** `Occupancy.remove` cleared cells that an overlapping survivor still
occupied, so `at()` reported free space that was full. Only visible once the resolver started
indexing overlapping bricks. The existing integrity test asserted on `size` and `columnTop` but
never on `at()`, which is exactly how it survived Phase 1.

**Blocked on accounts.** Supabase auth and profiles, saved builds, the gift flow and storage, and
both deploys. Need a Supabase project URL + anon key, and Vercel and Cloudflare accounts.

**Next.** Supabase auth and the gift flow, once keys are available.

### 2026-10-21 — Scope cut to a shareable portfolio piece

Direction changed: this should be a simple project page on hulash.com where people share a link
and build together, hosted on GitHub and embedded as an iframe. Nothing more complex.

**Cut.** Supabase, accounts, saved builds, the gift flow and its storage, Vercel, the entire
Rebrickable/Delta/dbt/Airflow data platform, the social feed, and recommendations. Phases 3–5
are gone; see §6a for the reasoning per item. Kept the templates, the collision resolver and the
reveal animation, all of which were already built and none of which need a backend.

**Done.**

- Static export (`output: "export"`, `trailingSlash`, `basePath` from the environment,
  `.nojekyll`). All four routes now prerender as static.
- Rooms moved from `/build/[roomId]` to `/build/?room=…` and `/reveal/?room=…`. A static host has
  no server to resolve a path segment a visitor invented, and `generateStaticParams` cannot
  enumerate room ids that do not exist yet.
- GitHub Actions workflow: lint, typecheck and test must pass before anything publishes.
- Verified by serving the exported folder through a Pages-alike with a `/kumitate` base path —
  all four routes and all nine referenced assets resolve.

**Decisions made.**

- **Multiplayer stays server-backed on Cloudflare, not peer-to-peer.** y-webrtc would have been
  100% GitHub with zero accounts, but it depends on public signalling servers that vanish
  without notice, loses the build the moment the last person disconnects, and fails behind
  strict networks. For a link a stranger might click at any hour, that is the wrong trade. The
  Workers free tier costs nothing and SQLite-backed Durable Objects are included.
- **The realtime host is build-time configuration, and a missing one is now loud.** If the site
  is deployed anywhere real while still pointing at `127.0.0.1:8787`, the builder shows a
  banner. Otherwise the failure mode is silent and awful: the page loads, the invite link
  copies, and nothing ever syncs, because every visitor's browser is dialling their own machine.
- **The invite link is built from the embedded app's own URL.** When framed, that is the Pages
  URL, so a recipient lands in the builder rather than somewhere on a portfolio page they would
  have to scroll. The parent URL is not readable cross-origin anyway.

**Next.** Deploy the worker, set the repo variable, embed on hulash.com.

### 2026-10-21 — Shipped

Live at <https://hulashc.github.io/kumitate/>, worker at
`kumitate-realtime.kumitate-realtime.workers.dev`, project entry added to `portfolio_nextjs`.

**Bug found by deploying.** The first Pages build served a 404 for `/build/` — the route the
entire app lives on. `.gitignore` carried a bare `build/`, which matched the _route directory_
`apps/web/src/app/build/`, so that file had never been committed. Local dev could not have
caught it: the file was on disk the whole time, so dev server, build, typecheck, lint and tests
all passed against a tree that git was not shipping. Fixed by anchoring the ignore rule, and the
workflow now asserts every expected route exists in the export before publishing.

**Verified against production**, not just locally: `sync-check` drove real WebSocket clients
through the deployed worker over `wss://` — sync both ways, deletes, persistence after everyone
disconnects, and concurrent-conflict convergence all pass. The live JS bundle was crawled to
confirm the worker host is the value actually baked in.

**Notes for next time.**

- The `workflow` OAuth scope turned out not to be needed to push `.github/workflows/`; the
  existing `repo` scope was enough.
- `gh api -X POST repos/:owner/:repo/pages -f build_type=workflow` enables Pages with Actions as
  the source without touching the web UI.
- The portfolio's `embed` section type already sets `allow="…clipboard-write…"`, so the invite
  button works inside the iframe with no change needed there.

**Outstanding:** a screenshot at `portfolio_nextjs/public/images/kumitate.jpg`, and pushing the
portfolio commit.
