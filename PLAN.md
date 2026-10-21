# Kumitate — Project Plan

> Kumitate (組み立て, "assembly"). Never use "LEGO" in the product name, logo or domain.

This file is the source of truth for the project. Claude Code reads it at the start of every session and updates the Progress Log at the end of every session.

---

## 1. Vision

A browser-based 3D brick builder where two or more people build together in the same scene, in real time. It should be simpler than any existing brick CAD tool: someone who has never used 3D software should be able to build a flower in five minutes.

Core use cases:

- **Build together** — share a link, a friend joins, you both place bricks in the same scene live.
- **Gift a build** — build a bouquet (or anything), attach a letter, send a link. The recipient gets a reveal: the build assembles brick by brick, then the letter appears.
- **Build it for real** — every build produces an exact parts list mapped to official LEGO element IDs, exportable as a BrickLink Wanted List so people can order the real pieces.

It is also a portfolio piece: a real product backed by a real, end-to-end data platform.

## 2. Principles

1. **Multiplayer-first.** Build state is a CRDT (Yjs) from day one. A solo session is just a room with one person.
2. **Simplicity over power.** Small curated palette, forgiving snapping, unlimited undo. Every feature must pass the "five-minute flower" test.
3. **Free to run.** Free tiers only for anything hosted. Heavy data tooling runs locally in Docker.
4. **The app never depends on the laptop.** The live site works even when the local data platform is off. Data outputs are enhancements with SQL fallbacks.
5. **Only buyable parts.** The palette is driven by a catalogue pipeline so users can't build with discontinued pieces (from Phase 3 on).
6. **Integer grid.** Brick positions are stored as integer grid coordinates, never floats, so concurrent edits never drift.

## 3. Architecture

```
            ┌───────────────── App layer (free cloud tiers) ─────────────────┐
            │                                                                │
  Browser ──┤  Next.js + React Three Fiber  ──ws──▶  Realtime server         │
            │  (apps/web, Vercel)                  (Yjs on Cloudflare         │
            │                                       Durable Objects,         │
            │                                       apps/realtime)           │
            │            │                                  │                │
            │            └────────────▶  Supabase  ◀────────┘                │
            │                    (Postgres, Auth, Storage) — from Phase 2    │
            └────────────────────────────────┬───────────────────────────────┘
                                             │ CDC (Debezium)
            ┌──────────────── Data platform (local Docker) ─┴────────────────┐
            │  Redpanda ─▶ Spark Structured Streaming ─▶ Delta on MinIO       │
            │  Rebrickable API ─▶ batch ingest ─▶ Delta                       │
            │  dbt + DuckDB (gold models) ─▶ reverse ETL ─▶ Supabase          │
            │  Airflow orchestrates · dbt tests for quality                   │
            │  Databricks Free Edition for the recommendation model           │
            └─────────────────────────────────────────────────────────────────┘
```

### Tech decisions

| Area                | Choice                                        | Why                                                       | Alternative considered               |
| ------------------- | --------------------------------------------- | --------------------------------------------------------- | ------------------------------------ |
| App language        | TypeScript (strict)                           | One language across web + realtime                        | Python backend (kept for data layer) |
| Frontend            | Next.js (App Router)                          | Matches hulash.com, free Vercel hosting                   | Vite SPA                             |
| 3D                  | three.js via React Three Fiber + drei         | Mature, LDraw loader available                            | Babylon.js                           |
| Multiplayer state   | Yjs (CRDT) + awareness                        | Conflict-free concurrent edits, presence built in         | Liveblocks (paid tiers)              |
| Realtime transport  | y-partyserver on Cloudflare Durable Objects   | Free tier, same code local and deployed                   | Self-hosted y-websocket              |
| Local UI state      | Zustand                                       | Small, simple                                             | Redux                                |
| DB / auth / storage | Supabase                                      | Free tier, Postgres for CDC                               | Firebase                             |
| Brick geometry      | Procedural (Phase 1) → LDraw meshes (Phase 4) | Fast soft start, keyed by LDraw IDs so swap is painless   | LDraw from day one                   |
| Parts mapping       | Rebrickable API                               | Maps LDraw IDs ↔ LEGO element IDs ↔ BrickLink IDs         | Manual mapping                       |
| Ordering export     | BrickLink Wanted List XML + LEGO element IDs  | No public LEGO Pick a Brick API                           | —                                    |
| Streaming           | Redpanda + Spark Structured Streaming         | Kafka API, single container; Spark aligns with Databricks | Flink                                |
| Table format        | Delta Lake on MinIO                           | Databricks-aligned                                        | Iceberg                              |
| Modelling           | dbt + DuckDB                                  | Free, fast, portfolio standard                            | —                                    |
| Orchestration       | Airflow                                       | Industry standard                                         | Dagster                              |

## 4. Repository structure

```
/
├── PLAN.md                  ← this file
├── CLAUDE.md                ← short pointer to PLAN.md + working rules
├── package.json             ← pnpm workspaces
├── apps/
│   ├── web/                 ← Next.js app (builder, rooms, later gifts/feed)
│   └── realtime/            ← Cloudflare Worker, Yjs rooms on Durable Objects
├── packages/
│   └── brick-core/          ← shared types, part catalogue, colours, grid math, collision, schema
└── data/                    ← data platform (Phase 3+): docker-compose, dbt, airflow, spark jobs
    └── README.md
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

### Later tables (Supabase, Phase 2+)

`profiles`, `builds` (id, room_id, owner, title, snapshot jsonb, thumbnail_url), `gifts` (id, build_snapshot jsonb, letter, sender, created_at, opened_at), `likes`, `comments`, `events` (append-only activity log for CDC).

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

### Phase 2 — Gifting + accounts + deploy

- [ ] Supabase auth (magic link), profiles
- [ ] Save named builds, list "my builds"
- [ ] Templates: flower stem, heart, card frame
- [ ] Gift flow: snapshot build + letter → share link
- [ ] Reveal page (no account needed): bricks assemble in placement order, then the letter
- [x] Concurrent-collision resolver
- [ ] Deploy web to Vercel, realtime to Cloudflare

### Phase 3 — Real parts: catalogue pipeline + parts list

- [ ] `data/` docker-compose: MinIO, Spark, Airflow, DuckDB/dbt
- [ ] Daily Rebrickable ingest (parts, colours, elements) → Delta bronze/silver
- [ ] dbt gold: `buyable_parts` (part × colour with a current element ID)
- [ ] Reverse ETL to Supabase; builder palette reads from it (fallback: static catalogue)
- [ ] Parts list panel: counts per part/colour, LEGO element IDs
- [ ] BrickLink Wanted List XML export
- [ ] Optional: BrickLink price guide → estimated cost per build

### Phase 4 — Social feed, overlays, activity streaming

- [ ] Publish builds to a feed, likes, comments
- [ ] Overlays: decals/printed tiles, preset materials (chrome, transparent, metallic), shader effects (glow, holographic, toon)
- [ ] Swap procedural geometry for LDraw meshes (instanced)
- [ ] `events` table → Debezium CDC → Redpanda → Spark → Delta
- [ ] dbt models for trending builds, active rooms, gift funnel
- [ ] Dashboards

### Phase 5 — Recommendations

- [ ] Recommendation model in Databricks Free Edition
- [ ] Reverse ETL "you might like" into the feed (fallback: most liked recent)

## 7. Legal and attribution

- No "LEGO" in the product name, logo or domain. Saying parts can be ordered from LEGO / BrickLink is fine.
- LDraw parts library is CC BY 2.0: credit LDraw when meshes are used.
- Rebrickable API: follow their terms and credit them on the parts list page.
- Verify current terms before Phase 3 and Phase 4.

## 8. Open questions

- Domain for Kumitate
- Max players per room (start: 8)
- Do gift recipients get a "build back" button that opens a new shared room with the sender?

## 9. Progress log

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
