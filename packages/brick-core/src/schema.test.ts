import { describe, expect, it } from "vitest";
import {
  BUILD_FORMAT_KIND,
  BUILD_FORMAT_VERSION,
  createBuildFile,
  parseBuildFile,
  reviewBuild,
} from "./schema.js";
import type { Brick } from "./grid.js";
import { PALETTE } from "./colors.js";
import { PARTS, resolvePart } from "./parts.js";

const BRICKS: Brick[] = [
  { id: "a", part: "3001", color: 4, x: 0, y: 0, z: 0, rot: 0, by: "client-1" },
  { id: "b", part: "3023b", color: 15, x: 2, y: 3, z: 1, rot: 2, by: "client-2" },
];

const EXPORTED_AT = "2026-10-20T12:00:00.000Z";

describe("catalogue integrity", () => {
  it("has 16 parts with unique ids", () => {
    expect(PARTS).toHaveLength(16);
    expect(new Set(PARTS.map((p) => p.id)).size).toBe(16);
  });

  it("has 12 palette colours with unique codes and 6-digit hex", () => {
    expect(PALETTE).toHaveLength(12);
    expect(new Set(PALETTE.map((c) => c.code)).size).toBe(12);
    for (const c of PALETTE) expect(c.hex).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("resolves the two renamed LDraw ids through their legacy aliases", () => {
    expect(resolvePart("3023")?.id).toBe("3023b");
    expect(resolvePart("4073")?.id).toBe("6141");
  });

  it("gives tiles no studs and everything else studs", () => {
    for (const p of PARTS) {
      expect(p.studs === "none").toBe(p.category === "tile");
    }
  });
});

describe("build file round-trip", () => {
  it("exports then imports to exactly the same bricks", () => {
    const file = createBuildFile(BRICKS, { title: "Bouquet", baseplate: 32 }, EXPORTED_AT);
    const result = parseBuildFile(JSON.stringify(file));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.build).toEqual(file);
    expect(result.build.bricks).toEqual(BRICKS);
  });

  it("survives a double round-trip unchanged", () => {
    const once = JSON.stringify(
      createBuildFile(BRICKS, { title: "T", baseplate: 32 }, EXPORTED_AT),
    );
    const parsed = parseBuildFile(once);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(JSON.stringify(parsed.build)).toBe(once);
  });

  it("stamps the current kind and version", () => {
    const file = createBuildFile([], { title: "Empty", baseplate: 32 }, EXPORTED_AT);
    expect(file.kind).toBe(BUILD_FORMAT_KIND);
    expect(file.version).toBe(BUILD_FORMAT_VERSION);
  });
});

describe("import validation", () => {
  it("rejects text that is not JSON", () => {
    const result = parseBuildFile("<html>nope</html>");
    expect(result).toEqual({ ok: false, error: "That file is not valid JSON." });
  });

  it("rejects JSON that is not a Kumitate build", () => {
    const result = parseBuildFile(JSON.stringify({ kind: "something-else", version: 1 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("not a Kumitate build");
  });

  it("rejects a future format version by name", () => {
    const result = parseBuildFile(
      JSON.stringify({ kind: BUILD_FORMAT_KIND, version: 99, exportedAt: EXPORTED_AT, bricks: [] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Unsupported build version 99");
  });

  it("rejects a non-integer coordinate", () => {
    const file = createBuildFile(BRICKS, { title: "T", baseplate: 32 }, EXPORTED_AT);
    const broken = JSON.parse(JSON.stringify(file)) as { bricks: { x: number }[] };
    broken.bricks[0]!.x = 1.5;
    const result = parseBuildFile(JSON.stringify(broken));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("bricks.0.x");
  });

  it("rejects an out-of-range rotation", () => {
    const file = createBuildFile(BRICKS, { title: "T", baseplate: 32 }, EXPORTED_AT);
    const broken = JSON.parse(JSON.stringify(file)) as { bricks: { rot: number }[] };
    broken.bricks[0]!.rot = 7;
    expect(parseBuildFile(JSON.stringify(broken)).ok).toBe(false);
  });

  it("rejects a brick below the baseplate", () => {
    const file = createBuildFile(BRICKS, { title: "T", baseplate: 32 }, EXPORTED_AT);
    const broken = JSON.parse(JSON.stringify(file)) as { bricks: { y: number }[] };
    broken.bricks[0]!.y = -1;
    expect(parseBuildFile(JSON.stringify(broken)).ok).toBe(false);
  });

  it("defaults a missing title and baseplate", () => {
    const result = parseBuildFile(
      JSON.stringify({
        kind: BUILD_FORMAT_KIND,
        version: BUILD_FORMAT_VERSION,
        exportedAt: EXPORTED_AT,
        bricks: [],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.build.title).toBe("Untitled build");
    expect(result.build.baseplate).toBe(32);
  });
});

describe("reviewBuild", () => {
  it("passes a build that uses only catalogue parts and colours", () => {
    const review = reviewBuild(createBuildFile(BRICKS, { title: "T", baseplate: 32 }, EXPORTED_AT));
    expect(review.known).toHaveLength(2);
    expect(review.unknownParts).toEqual([]);
    expect(review.unknownColors).toEqual([]);
  });

  it("reports unknown parts and colours without dropping the whole build", () => {
    const bricks: Brick[] = [
      ...BRICKS,
      { id: "c", part: "99999", color: 4, x: 5, y: 0, z: 5, rot: 0, by: "x" },
      { id: "d", part: "3001", color: 1234, x: 7, y: 0, z: 7, rot: 0, by: "x" },
    ];
    const review = reviewBuild(createBuildFile(bricks, { title: "T", baseplate: 32 }, EXPORTED_AT));
    expect(review.known).toHaveLength(2);
    expect(review.unknownParts).toEqual(["99999"]);
    expect(review.unknownColors).toEqual([1234]);
  });
});
