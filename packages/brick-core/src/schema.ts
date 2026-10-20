/**
 * Wire and file formats, validated with zod.
 *
 * The export envelope is versioned from day one: `version` is checked on import, so a file
 * written today still loads after the format moves on. Bricks are validated structurally here;
 * whether a part or colour is actually in the catalogue is a separate, softer question handled by
 * {@link reviewBuild}.
 */

import { z } from "zod";
import { BASEPLATE_SIZE, type Brick } from "./grid";
import { getColor } from "./colors";
import { resolvePart } from "./parts";

/** Bumped whenever the export format changes incompatibly. */
export const BUILD_FORMAT_VERSION = 1;

/** Identifies our files, so importing someone else's JSON fails loudly rather than weirdly. */
export const BUILD_FORMAT_KIND = "kumitate.build";

const integer = z.number().int();

export const rotationSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

export const brickSchema = z.object({
  id: z.string().min(1),
  part: z.string().min(1),
  color: integer,
  x: integer,
  y: integer.min(0),
  z: integer,
  rot: rotationSchema,
  by: z.string(),
}) satisfies z.ZodType<Brick>;

export const buildFileSchema = z.object({
  kind: z.literal(BUILD_FORMAT_KIND),
  version: z.literal(BUILD_FORMAT_VERSION),
  title: z.string().default("Untitled build"),
  baseplate: integer.min(1).max(256).default(BASEPLATE_SIZE),
  exportedAt: z.string(),
  bricks: z.array(brickSchema),
});

export type BuildFile = z.infer<typeof buildFileSchema>;

export type BuildMeta = {
  title: string;
  baseplate: number;
};

/** Build an export payload. */
export function createBuildFile(
  bricks: readonly Brick[],
  meta: BuildMeta,
  exportedAt: string,
): BuildFile {
  return {
    kind: BUILD_FORMAT_KIND,
    version: BUILD_FORMAT_VERSION,
    title: meta.title,
    baseplate: meta.baseplate,
    exportedAt,
    bricks: [...bricks],
  };
}

export type ParseBuildResult = { ok: true; build: BuildFile } | { ok: false; error: string };

/**
 * Parse and validate untrusted JSON text as a build file.
 *
 * Never throws — import is user-facing and a bad file should produce a readable message, not a
 * stack trace.
 */
export function parseBuildFile(text: string): ParseBuildResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file is not valid JSON." };
  }

  const parsed = buildFileSchema.safeParse(raw);
  if (!parsed.success) {
    const record = raw as Record<string, unknown> | null;
    if (record && typeof record === "object" && record["kind"] !== BUILD_FORMAT_KIND) {
      return { ok: false, error: "That JSON file is not a Kumitate build." };
    }
    if (record && typeof record === "object" && record["version"] !== BUILD_FORMAT_VERSION) {
      return {
        ok: false,
        error: `Unsupported build version ${String(record["version"])} — this app reads version ${BUILD_FORMAT_VERSION}.`,
      };
    }
    const first = parsed.error.issues[0];
    const where = first && first.path.length > 0 ? ` at ${first.path.join(".")}` : "";
    return {
      ok: false,
      error: `Malformed build file${where}: ${first?.message ?? "unknown error"}`,
    };
  }

  return { ok: true, build: parsed.data };
}

export type BuildReview = {
  /** Bricks whose part and colour both resolve — safe to render as intended. */
  known: Brick[];
  /** Part IDs in the file that are not in the catalogue. */
  unknownParts: string[];
  /** Colour codes in the file that are not in the palette. */
  unknownColors: number[];
};

/**
 * Check a parsed build against the current catalogue.
 *
 * Unknown parts and colours are reported rather than rejected: the renderer falls back to a
 * default so a build from a newer palette still opens, just not pixel-perfect.
 */
export function reviewBuild(build: BuildFile): BuildReview {
  const unknownParts = new Set<string>();
  const unknownColors = new Set<number>();
  const known: Brick[] = [];

  for (const brick of build.bricks) {
    const partOk = resolvePart(brick.part) !== undefined;
    const colorOk = getColor(brick.color) !== undefined;
    if (!partOk) unknownParts.add(brick.part);
    if (!colorOk) unknownColors.add(brick.color);
    if (partOk && colorOk) known.push(brick);
  }

  return {
    known,
    unknownParts: [...unknownParts],
    unknownColors: [...unknownColors],
  };
}
