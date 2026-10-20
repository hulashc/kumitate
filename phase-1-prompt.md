You're building Phase 1 of Kumitate, a multiplayer 3D brick builder that runs in the browser. PLAN.md is in the repo root and is the source of truth. Read it fully before doing anything.

## Your task

Build Phase 1 — Soft start, exactly as scoped in PLAN.md section 6. This runs locally only. No accounts, no Supabase, no deploys yet. The goal is that I can open two browser windows on the same room and build together.

## How to work

1. Read PLAN.md. Then write a short implementation plan (files, packages, order of work) and show it to me before writing code.
2. Create `CLAUDE.md` in the repo root: a few lines pointing to PLAN.md plus the working rules below, so future sessions pick them up.
3. Build in small steps and commit after each working step with a clear message. Suggested order:
   a. Monorepo scaffold (pnpm workspaces), TypeScript strict everywhere, ESLint + Prettier
   b. `packages/brick-core`: part catalogue, colours, grid maths, collision, with vitest tests
   c. `apps/web`: single-player builder against a local Y.Doc (scene, ghost brick, place, rotate, delete, palette)
   d. `apps/realtime`: Cloudflare Worker using y-partyserver on Durable Objects, run locally with `wrangler dev`
   e. Connect web to realtime: rooms, sync, persistence
   f. Presence (cursors, names, ghost bricks of others) and per-user undo/redo
   g. Export/import JSON, landing page, polish
4. Check current docs for y-partyserver, wrangler, React Three Fiber and Next.js before using them. Don't rely on memory for APIs or versions.
5. Don't add paid services. Ask me before adding any dependency not named here or in PLAN.md.

## Key requirements

**Grid and units.** Positions are integers: x/z in studs, y in plates (1 brick = 3 plates). 1 stud = 20 LDU, 1 plate = 8 LDU. Convert to three.js units only in the renderer. Never store floats in the Yjs doc.

**Parts.** About 16 parts with procedural geometry (box body plus cylinder studs, tiles have no studs), keyed by LDraw part ID so we can swap to real LDraw meshes later. Start with: bricks 1x1 (3005), 1x2 (3004), 1x4 (3010), 2x2 (3003), 2x3 (3002), 2x4 (3001); plates 1x1 (3024), 1x2 (3023), 1x4 (3710), 2x2 (3022), 2x4 (3020); tiles 1x1 (3070b), 1x2 (3069b), 2x2 (3068b); round plate 1x1 (4073); slope 45 2x2 (3039). Verify IDs against the LDraw library and flag any that look wrong.

**Colours.** About 12 LDraw colour codes with accurate RGB from LDConfig.ldr: Black 0, Blue 1, Green 2, Red 4, Bright Pink 29, Yellow 14, White 15, Orange 25, Lime 27, Tan 19, Light Bluish Gray 71, Dark Bluish Gray 72. Verify against LDConfig.

**Builder UX.** This must feel simple:
- 32×32 baseplate, orbit camera (left-drag orbit, right-drag pan, scroll zoom), soft lighting with shadows
- Hovering shows a translucent ghost brick snapped to the grid; it sits on the baseplate or on top of whatever brick is under the cursor
- Click to place; ghost turns red where placement would collide
- R rotates, Delete/Backspace or right-click on a brick removes it
- Bottom toolbar with part picker (small previews) and colour swatches
- Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z for undo/redo

**Multiplayer.**
- Route `/build/[roomId]`. Landing page has a "Start building" button that creates a room with a nanoid and a "Copy invite link" button inside the room.
- Yjs layout exactly as in PLAN.md section 5.
- Presence via awareness: a random friendly name and colour per tab (editable), other people's cursors and ghost bricks visible in the scene, a small list of who's in the room.
- Undo uses Y.UndoManager scoped to the local origin, so I can never undo someone else's brick.
- Room state persists in the Durable Object; a refresh or rejoin restores the build.

**Rendering.** Use instancing or merged geometry per part/colour so 2,000+ bricks stay smooth.

**Export/import.** Download the build as JSON (versioned schema, validated with zod on import).

## Definition of done

- `pnpm install && pnpm dev` starts web and realtime together
- Two windows on the same room see each other's bricks, cursors and ghosts almost instantly
- Undo only affects my own bricks
- Refresh keeps the build
- Export then import round-trips exactly
- vitest passes for grid maths and collision
- README with setup, run instructions and controls

When done, update the PLAN.md checklist and add a Progress Log entry. Then give me a short test script: the exact steps I should try by hand to check everything works, including edge cases (stacking, collisions, simultaneous edits, rejoining). Stop there and wait for my feedback before starting Phase 2.
