"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as Y from "yjs";
import { nanoid } from "nanoid";
import { BASEPLATE_SIZE } from "@kumitate/brick-core";
import { BuildStore } from "@/lib/buildStore";
import { useBricks, useBuildMeta } from "@/lib/useBuildStore";
import { useUndoState } from "@/lib/useUndoState";
import { useUiStore } from "@/lib/uiStore";
import { BuildScene } from "./BuildScene";
import { Toolbar } from "./Toolbar";
import styles from "./Builder.module.css";

/** True if the key event came from somewhere the user is typing. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

export function Builder({ roomId }: { roomId: string }) {
  // One doc and one store for the lifetime of the room view.
  const [store] = useState(() => new BuildStore(new Y.Doc()));
  const [clientId] = useState(() => nanoid(8));
  const hoveredRef = useRef<string | null>(null);

  const bricks = useBricks(store);
  const meta = useBuildMeta(store);
  const { canUndo, canRedo } = useUndoState(store);
  const rotate = useUiStore((s) => s.rotate);

  useEffect(() => {
    store.initialiseMeta({ title: "Untitled build", baseplate: BASEPLATE_SIZE });
    return () => store.destroy();
  }, [store]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      const mod = event.metaKey || event.ctrlKey;

      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) store.redo();
        else store.undo();
        return;
      }

      if (mod && event.key.toLowerCase() === "y") {
        event.preventDefault();
        store.redo();
        return;
      }

      if (mod) return;

      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        rotate();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        const target = hoveredRef.current;
        if (target) {
          event.preventDefault();
          store.removeBrick(target);
          hoveredRef.current = null;
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store, rotate]);

  const baseplateSize = meta.baseplate;

  const camera = useMemo(
    () => ({
      position: [baseplateSize * 0.8, baseplateSize * 0.7, baseplateSize * 0.8] as const,
      fov: 42,
    }),
    [baseplateSize],
  );

  return (
    <div className={styles.root}>
      <div
        className={styles.canvasWrap}
        // Right-drag pans the camera and right-click deletes a brick; neither wants the
        // browser's own menu on top.
        onContextMenu={(event) => event.preventDefault()}
      >
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [...camera.position], fov: camera.fov }}
          gl={{ antialias: true }}
        >
          <color attach="background" args={["#0F1720"]} />
          <fog attach="fog" args={["#0F1720", baseplateSize * 1.6, baseplateSize * 3.4]} />
          <BuildScene
            store={store}
            bricks={bricks}
            baseplateSize={baseplateSize}
            clientId={clientId}
            hoveredRef={hoveredRef}
          />
        </Canvas>
      </div>

      <header className={styles.header}>
        <span className={styles.brand}>Kumitate</span>
        <span className={styles.room}>Room {roomId}</span>
      </header>

      <Toolbar
        brickCount={bricks.length}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => store.undo()}
        onRedo={() => store.redo()}
      />
    </div>
  );
}
