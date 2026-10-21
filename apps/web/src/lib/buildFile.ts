"use client";

/** Download and upload of build files. */

import { createBuildFile, parseBuildFile, reviewBuild } from "@kumitate/brick-core";
import type { BuildStore } from "./buildStore";

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "build";
}

/** Serialise the current build and hand it to the browser as a download. */
export function downloadBuild(store: BuildStore): void {
  const meta = store.getMetaSnapshot();
  const file = createBuildFile(store.getSnapshot(), meta, new Date().toISOString());

  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slugify(meta.title)}.kumitate.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  // Revoking immediately can cancel the download in some browsers; one tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type ImportOutcome = { ok: true; message: string } | { ok: false; message: string };

/**
 * Replace the build with the contents of a file.
 *
 * Destructive by design — it swaps the whole room, in one transaction, so a mis-click is a
 * single Ctrl+Z away.
 */
export async function importBuildFile(store: BuildStore, file: File): Promise<ImportOutcome> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, message: "Could not read that file." };
  }

  const parsed = parseBuildFile(text);
  if (!parsed.ok) return { ok: false, message: parsed.error };

  const review = reviewBuild(parsed.build);
  store.replaceAll(parsed.build.bricks, {
    title: parsed.build.title,
    baseplate: parsed.build.baseplate,
  });

  const notes: string[] = [];
  if (review.unknownParts.length > 0) {
    notes.push(`${review.unknownParts.length} unknown part(s) drawn with a fallback shape`);
  }
  if (review.unknownColors.length > 0) {
    notes.push(`${review.unknownColors.length} unknown colour(s) drawn in the default colour`);
  }

  const count = parsed.build.bricks.length;
  const summary = `Loaded ${count} ${count === 1 ? "brick" : "bricks"}`;
  return { ok: true, message: notes.length > 0 ? `${summary} — ${notes.join("; ")}` : summary };
}
