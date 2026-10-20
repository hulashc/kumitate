"use client";

import { useEffect, useState } from "react";
import type { BuildStore } from "./buildStore";

/**
 * Reactive `canUndo` / `canRedo` for the toolbar.
 *
 * `Y.UndoManager` is an event emitter rather than a store, so the flags are mirrored into React
 * state on each stack event instead of being polled every frame.
 */
export function useUndoState(store: BuildStore | null): { canUndo: boolean; canRedo: boolean } {
  const [state, setState] = useState({ canUndo: false, canRedo: false });

  useEffect(() => {
    if (!store) return;

    const sync = () => {
      setState((previous) => {
        const next = { canUndo: store.canUndo, canRedo: store.canRedo };
        return previous.canUndo === next.canUndo && previous.canRedo === next.canRedo
          ? previous
          : next;
      });
    };

    sync();
    const manager = store.undoManager;
    manager.on("stack-item-added", sync);
    manager.on("stack-item-popped", sync);
    manager.on("stack-cleared", sync);
    manager.on("stack-item-updated", sync);

    return () => {
      manager.off("stack-item-added", sync);
      manager.off("stack-item-popped", sync);
      manager.off("stack-cleared", sync);
      manager.off("stack-item-updated", sync);
    };
  }, [store]);

  return state;
}
