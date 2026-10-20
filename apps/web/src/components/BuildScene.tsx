"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { OrbitControls } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { nanoid } from "nanoid";
import {
  canPlace,
  centerOnCell,
  clampToBaseplate,
  getPartOrDefault,
  type Brick,
} from "@kumitate/brick-core";
import type { BuildStore } from "@/lib/buildStore";
import { useUiStore } from "@/lib/uiStore";
import { worldPointToCell } from "@/lib/transform";
import { Baseplate } from "./Baseplate";
import { BrickInstances, brickIdFromHit } from "./BrickInstances";
import { GhostBrick, type GhostState } from "./GhostBrick";
import { HoverOutline } from "./HoverOutline";

/**
 * Pointer travel, in CSS pixels, above which a press-and-release counts as a camera drag rather
 * than a click. Without this every orbit would also place a brick.
 */
const DRAG_SLOP_PX = 5;

export type BuildSceneProps = {
  store: BuildStore;
  bricks: Brick[];
  baseplateSize: number;
  clientId: string;
  /** Kept in sync so the window-level Delete handler can read the hovered brick cheaply. */
  hoveredRef: RefObject<string | null>;
  /** Called whenever the local ghost moves, so presence can broadcast it. */
  onGhostChange?: (ghost: GhostState | null) => void;
};

export function BuildScene({
  store,
  bricks,
  baseplateSize,
  clientId,
  hoveredRef,
  onGhostChange,
}: BuildSceneProps) {
  const part = useUiStore((s) => s.part);
  const color = useUiStore((s) => s.color);
  const rot = useUiStore((s) => s.rot);

  const [ghost, setGhost] = useState<GhostState | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const ghostRef = useRef<GhostState | null>(null);
  const lastCellRef = useRef<{ x: number; z: number } | null>(null);
  const pressRef = useRef<{ x: number; y: number; button: number } | null>(null);

  const selectedPart = useMemo(() => getPartOrDefault(part), [part]);

  const publishGhost = useCallback(
    (next: GhostState | null) => {
      ghostRef.current = next;
      setGhost(next);
      onGhostChange?.(next);
    },
    [onGhostChange],
  );

  /**
   * Work out where the ghost belongs for a grid cell.
   *
   * Centre the part on the cell, slide it back onto the plate if it overhangs, then drop it onto
   * whatever is underneath. The result is always *somewhere* sensible; `valid` says whether it
   * may actually be placed there.
   */
  const computeGhost = useCallback(
    (cellX: number, cellZ: number): GhostState => {
      const centred = centerOnCell(selectedPart, rot, cellX, cellZ);
      const clamped = clampToBaseplate(centred, baseplateSize);
      const dropped = store.occupancy.drop(clamped);
      const result = canPlace(dropped, store.occupancy, { baseplateSize });

      return {
        part: selectedPart,
        color,
        x: dropped.x,
        y: dropped.y,
        z: dropped.z,
        rot,
        valid: result.ok,
      };
    },
    [selectedPart, rot, color, baseplateSize, store],
  );

  /** Re-run the ghost calculation for the last known cell — after a placement or a rotation. */
  const refreshGhost = useCallback(() => {
    const cell = lastCellRef.current;
    if (!cell) return;
    publishGhost(computeGhost(cell.x, cell.z));
  }, [computeGhost, publishGhost]);

  /**
   * Keep the ghost honest when something other than the pointer changes it: picking a new part
   * or colour, pressing R, or a peer placing a brick in the column we are hovering.
   */
  useEffect(() => {
    refreshGhost();
  }, [refreshGhost, bricks]);

  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const hit = event.intersections[0];
      if (!hit) return;
      event.stopPropagation();

      const cell = worldPointToCell(hit.point.x, hit.point.z, baseplateSize);
      const previous = lastCellRef.current;
      const cellChanged = !previous || previous.x !== cell.x || previous.z !== cell.z;
      lastCellRef.current = cell;

      const overBrick = brickIdFromHit(hit.object, hit.instanceId);
      if (overBrick !== hoveredRef.current) {
        hoveredRef.current = overBrick;
        setHovered(overBrick);
      }

      if (cellChanged) publishGhost(computeGhost(cell.x, cell.z));
    },
    [baseplateSize, computeGhost, hoveredRef, publishGhost],
  );

  const handlePointerDown = useCallback((event: ThreeEvent<PointerEvent>) => {
    pressRef.current = {
      x: event.nativeEvent.clientX,
      y: event.nativeEvent.clientY,
      button: event.nativeEvent.button,
    };
  }, []);

  const placeBrick = useCallback(() => {
    const current = ghostRef.current;
    if (!current || !current.valid) return;

    store.addBrick({
      id: nanoid(10),
      part: current.part.id,
      color: current.color,
      x: current.x,
      y: current.y,
      z: current.z,
      rot: current.rot,
      by: clientId,
    });

    // The column just got taller, so the ghost has to climb even if the pointer has not moved.
    refreshGhost();
  }, [store, clientId, refreshGhost]);

  const handlePointerUp = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const press = pressRef.current;
      pressRef.current = null;
      if (!press || press.button !== event.nativeEvent.button) return;

      const travelled = Math.hypot(
        event.nativeEvent.clientX - press.x,
        event.nativeEvent.clientY - press.y,
      );
      if (travelled > DRAG_SLOP_PX) return; // that was a camera move, not a click

      event.stopPropagation();

      if (press.button === 0) {
        placeBrick();
        return;
      }

      if (press.button === 2) {
        const hit = event.intersections[0];
        const target = hit ? brickIdFromHit(hit.object, hit.instanceId) : null;
        if (target) {
          store.removeBrick(target);
          hoveredRef.current = null;
          setHovered(null);
          refreshGhost();
        }
      }
    },
    [placeBrick, store, hoveredRef, refreshGhost],
  );

  const hoveredBrick = hovered ? store.getBrick(hovered) : undefined;

  return (
    <>
      <hemisphereLight args={["#ffffff", "#9aa7b1", 1.1]} />
      <directionalLight
        position={[18, 28, 12]}
        intensity={2.1}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-28}
        shadow-camera-right={28}
        shadow-camera-top={28}
        shadow-camera-bottom={-28}
        shadow-camera-near={1}
        shadow-camera-far={90}
        shadow-bias={-0.0008}
      />
      <directionalLight position={[-14, 12, -16]} intensity={0.45} />

      <group
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        {/*
          A single invisible plane at y = 0 that extends well past the plate. It guarantees the
          pointer always resolves to a cell, which is what lets the ghost slide along the edge
          instead of vanishing when the cursor drifts off the baseplate.
        */}
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[baseplateSize * 3, baseplateSize * 3]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>

        <BrickInstances bricks={bricks} baseplateSize={baseplateSize} />
      </group>

      <Baseplate size={baseplateSize} />

      {ghost && <GhostBrick ghost={ghost} baseplateSize={baseplateSize} />}
      {hoveredBrick && <HoverOutline brick={hoveredBrick} baseplateSize={baseplateSize} />}

      <OrbitControls
        makeDefault
        target={[0, 1.5, 0]}
        enableDamping
        dampingFactor={0.12}
        minDistance={6}
        maxDistance={90}
        // Stop the camera dropping below the baseplate, where the scene reads as an empty void.
        maxPolarAngle={Math.PI / 2 - 0.05}
      />
    </>
  );
}
