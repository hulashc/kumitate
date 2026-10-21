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
4. **The scope is "share a link, build together".** The project was deliberately cut back to
   that one sentence (PLAN.md §6a). No accounts, no database, no feed, no data platform. If a
   feature needs a login or a server beyond the realtime worker, it is out of scope — say so
   rather than building it.
5. **It must stay statically hostable.** `apps/web` is `output: "export"` on GitHub Pages. No
   server components doing real work, no API routes, no runtime env vars, no `next/image`
   optimisation. Rooms live in `?room=`, never a path segment.
6. **Check current docs before using a library API.** Do not rely on memory for APIs or versions —
   especially y-partyserver, wrangler, React Three Fiber and Next.js.
7. **Ask before adding any dependency** not already named in `PLAN.md` or already in the lockfile.
   No paid services.
8. **Commit after each working step** with a clear message.
9. **Small steps.** Build, verify it runs, commit, then move on.
10. **Update `PLAN.md` at the end of every session**: tick the phase checklist and append one
    Progress Log entry (date, what was done, what's next, decisions made).

## Layout

| Path                   | What                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `packages/brick-core/` | Shared types, part catalogue, colours, grid maths, collision, zod schema. No 3D or React deps. |
| `apps/web/`            | Next.js App Router builder (React Three Fiber). Static export → GitHub Pages.                  |
| `apps/realtime/`       | Cloudflare Worker — Yjs rooms on Durable Objects via y-partyserver.                            |

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
- `pnpm install` warns about an unmet peer: `y-partyserver@2.2.0` asks for
  `@cloudflare/workers-types@^4`, but we pin `^5` because its datestamp matches the installed
  `workerd` runtime and because `wrangler` asks for `^5` too. The two peers are mutually
  exclusive, so one warning is unavoidable. **Expected — do not "fix" it by downgrading**, which
  just moves the warning to wrangler. Typecheck passes on v5.
- Two LDraw part IDs in the original brief were renamed by the official library: Plate 1x2 is
  **3023b** (not 3023, moved 2024-07) and Plate 1x1 Round is **6141** (not 4073, moved 2025-04).
  The catalogue keys on the canonical ID and keeps the legacy/BrickLink ID in `aliases`.
- The Worker imports brick-core **by subpath** (`@kumitate/brick-core/resolve`), not the barrel.
  The barrel re-exports the zod schema and tripled the Worker bundle.
- On Windows, do not round-trip UTF-8 files through `Get-Content` / `Set-Content`: PowerShell 5.1
  reads as ANSI and will double-encode every em dash and kanji in `PLAN.md`. Use the editing
  tools, or `[System.IO.File]::ReadAllText/WriteAllText` with an explicit UTF8 encoding.
