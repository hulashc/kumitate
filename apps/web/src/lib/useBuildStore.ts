"use client";

/** React bindings for {@link BuildStore}. */

import { useSyncExternalStore } from "react";
import type { Brick } from "@kumitate/brick-core";
import type { BuildStore, BuildMetaState } from "./buildStore";

/** Stable empty array so the server render and the first client render agree. */
const EMPTY: Brick[] = [];

/** Every brick in the build, re-rendering only when the doc actually changes. */
export function useBricks(store: BuildStore | null): Brick[] {
  return useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    store ? store.getSnapshot : getEmpty,
    getEmpty,
  );
}

const DEFAULT_META: BuildMetaState = { title: "Untitled build", baseplate: 32 };

export function useBuildMeta(store: BuildStore | null): BuildMetaState {
  return useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    store ? store.getMetaSnapshot : getDefaultMeta,
    getDefaultMeta,
  );
}

function noopSubscribe(): () => void {
  return () => {};
}

function getEmpty(): Brick[] {
  return EMPTY;
}

function getDefaultMeta(): BuildMetaState {
  return DEFAULT_META;
}
