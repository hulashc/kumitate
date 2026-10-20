# Kumitate — working rules for Claude Code

**Read `PLAN.md` first, in full. It is the source of truth** for vision, architecture, data model
and phases. This file only holds the working rules.

## Working rules

1. **Never use "LEGO" in the product name, logo or domain.** Saying parts can be ordered from
   LEGO or BrickLink is fine.
2. **Integer grid, always.** Brick positions are integers: `x`/`z` in studs, `y` in plates
   (1 brick = 3 plates). 1 stud = 20 LDU, 1 plate = 8 LDU. Convert to three.js units **only** in
   the renderer, via `packages/brick-core/src/units.ts`. Never store a float in the Yjs doc.
3. **Multiplayer-first.** Build state lives in the Yjs doc, never in React state. A solo session is
   just a room with one person. Zustand holds UI-only state (selected part, selected colour).
4. **Check current docs before using a library API.** Do not rely on memory for APIs or versions —
   especially y-partyserver, wrangler, React Three Fiber and Next.js.
5. **Ask before adding any dependency** not already named in `PLAN.md` or already in the lockfile.
   No paid services.
6. **Commit after each working step** with a clear message.
7. **Small steps.** Build, verify it runs, commit, then move on.
8. **Update `PLAN.md` at the end of every session**: tick the phase checklist and append one
   Progress Log entry (date, what was done, what's next, decisions made).

## Layout

| Path                   | What                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `packages/brick-core/` | Shared types, part catalogue, colours, grid maths, collision, zod schema. No 3D or React deps. |
| `apps/web/`            | Next.js App Router builder (React Three Fiber).                                                |
| `apps/realtime/`       | Cloudflare Worker — Yjs rooms on Durable Objects via y-partyserver.                            |
| `data/`                | Data platform. Phase 3+.                                                                       |

## Commands

```bash
pnpm install     # once
pnpm dev         # web (:3000) + realtime (:8787) together
pnpm test        # vitest across the workspace
pnpm typecheck   # tsc --noEmit across the workspace
pnpm lint        # eslint
pnpm format      # prettier --write
```

## Gotchas

- `brick-core` must stay dependency-light (zod only) — it is imported by the Worker, which has no
  Node built-ins.
- Two LDraw part IDs in the Phase 1 brief were renamed by the official library: Plate 1x2 is
  **3023b** (not 3023, moved 2024-07) and Plate 1x1 Round is **6141** (not 4073, moved 2025-04).
  The catalogue keys on the canonical ID and keeps the legacy/BrickLink ID in `aliases` for the
  Phase 3 BrickLink export.
