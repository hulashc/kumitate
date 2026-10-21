"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { BuildScene } from "./BuildScene";
import { RoomBar } from "./RoomBar";
import { Toolbar } from "./Toolbar";
import { PeerGhosts } from "./PeerGhosts";
import { Toast } from "./Toast";
import type { GhostState } from "./GhostBrick";
import { useRoom } from "@/lib/useRoom";
import { useBricks, useBuildMeta } from "@/lib/useBuildStore";
import { useUndoState } from "@/lib/useUndoState";
import { usePeers, useLocalPresence, publishGhost } from "@/lib/useAwareness";
import { loadIdentity, saveIdentity, type PresenceUser } from "@/lib/presence";
import { useUiStore } from "@/lib/uiStore";
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
  const { room, status } = useRoom(roomId);
  // Safe to read localStorage in the initialiser: this component is only ever client-rendered.
  const [identity, setIdentity] = useState<PresenceUser>(loadIdentity);
  const hoveredRef = useRef<string | null>(null);

  const store = room?.store ?? null;
  const provider = room?.provider ?? null;

  const bricks = useBricks(store);
  const meta = useBuildMeta(store);
  const { canUndo, canRedo } = useUndoState(store);
  const peers = usePeers(provider);
  const rotate = useUiStore((s) => s.rotate);
  const setTemplate = useUiStore((s) => s.setTemplate);

  useLocalPresence(provider, identity);

  // A brick silently vanishing is alarming; say why.
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!store || !room) return;
    return store.onConflictResolved((losers) => {
      const mine = losers.filter((loser) => loser.by === room.clientId).length;
      if (mine === 0) return;
      setToast(
        mine === 1
          ? "Someone placed a brick there at the same moment — yours was removed."
          : `${mine} of your bricks clashed with someone else's and were removed.`,
      );
      setTimeout(() => setToast(null), 4000);
    });
  }, [store, room]);

  const renameIdentity = useCallback(
    (name: string) => {
      const next = { ...identity, name };
      setIdentity(next);
      saveIdentity(next);
    },
    [identity],
  );

  const onGhostChange = useCallback(
    (ghost: GhostState | null) => {
      publishGhost(
        provider,
        ghost ? { x: ghost.x, y: ghost.y, z: ghost.z } : null,
        ghost ? { part: ghost.part.id, color: ghost.color, rot: ghost.rot } : null,
      );
    },
    [provider],
  );

  useEffect(() => {
    if (!store) return;

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

      if (event.key === "Escape") {
        setTemplate(null);
        return;
      }

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
  }, [store, rotate, setTemplate]);

  const baseplateSize = meta.baseplate;

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
          camera={{
            position: [baseplateSize * 0.8, baseplateSize * 0.7, baseplateSize * 0.8],
            fov: 42,
          }}
          gl={{ antialias: true }}
        >
          <color attach="background" args={["#0F1720"]} />
          <fog attach="fog" args={["#0F1720", baseplateSize * 1.6, baseplateSize * 3.4]} />

          {store && room && (
            <BuildScene
              store={store}
              bricks={bricks}
              baseplateSize={baseplateSize}
              clientId={room.clientId}
              hoveredRef={hoveredRef}
              onGhostChange={onGhostChange}
            />
          )}

          <PeerGhosts peers={peers} baseplateSize={baseplateSize} />
        </Canvas>
      </div>

      {store && (
        <RoomBar
          store={store}
          title={meta.title}
          status={status}
          identity={identity}
          peers={peers}
          onRenameIdentity={renameIdentity}
          onRetitle={(title) => store.setMeta({ title })}
        />
      )}

      {toast && <Toast message={toast} />}

      <Toolbar
        brickCount={bricks.length}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => store?.undo()}
        onRedo={() => store?.redo()}
      />
    </div>
  );
}
