"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import type * as THREE from "three";
import { getColorOrDefault, type Part, type Rotation } from "@kumitate/brick-core";
import { partGeometry } from "@/lib/geometry";
import { applyGridTransform } from "@/lib/transform";

/** Colour the ghost turns when the placement is blocked. */
const BLOCKED_COLOR = "#E53935";

export type GhostState = {
  part: Part;
  color: number;
  x: number;
  y: number;
  z: number;
  rot: Rotation;
  valid: boolean;
};

/**
 * The translucent preview of the brick about to be placed.
 *
 * Rendered as a plain mesh rather than through the instanced path: there is only ever one, and
 * it needs its own transparent material and depth settings.
 */
export function GhostBrick({ ghost, baseplateSize }: { ghost: GhostState; baseplateSize: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => partGeometry(ghost.part), [ghost.part]);

  const color = ghost.valid ? getColorOrDefault(ghost.color).hex : BLOCKED_COLOR;

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.matrixAutoUpdate = false;
    applyGridTransform(
      mesh,
      { part: ghost.part, x: ghost.x, y: ghost.y, z: ghost.z, rot: ghost.rot },
      baseplateSize,
    );
  }, [ghost.part, ghost.x, ghost.y, ghost.z, ghost.rot, baseplateSize]);

  return (
    <mesh ref={meshRef} geometry={geometry} raycast={() => null}>
      <meshStandardMaterial
        color={color}
        transparent
        opacity={ghost.valid ? 0.55 : 0.45}
        roughness={0.4}
        // Without this the ghost z-fights the brick it is resting on at shallow angles.
        depthWrite={false}
      />
    </mesh>
  );
}
