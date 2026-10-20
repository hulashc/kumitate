"use client";

import { memo, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { getPartOrDefault, getColorOrDefault, type Brick } from "@kumitate/brick-core";
import { partGeometry } from "@/lib/geometry";
import { applyGridTransform } from "@/lib/transform";

/**
 * Instanced brick rendering: one `InstancedMesh` per part, coloured per instance.
 *
 * 16 parts x 12 colours would be 192 meshes if colour were baked into the material, so colour
 * goes into `instanceColor` instead and the whole scene draws in at most 16 calls, regardless of
 * brick count.
 *
 * Deliberately knows nothing about hover or selection — those are drawn as separate overlay
 * meshes, so moving the pointer never has to rewrite the instance buffers.
 */

const scratch = new THREE.Object3D();
const scratchColor = new THREE.Color();

/**
 * Instance capacity is rounded up to a power of two with a floor of 64.
 *
 * `InstancedMesh` fixes its buffer size at construction, so growing means rebuilding the mesh.
 * Rounding up means that only happens on every doubling instead of on every single placement.
 */
function capacityFor(count: number): number {
  if (count <= 64) return 64;
  return 1 << Math.ceil(Math.log2(count));
}

type PartGroupProps = {
  partId: string;
  bricks: Brick[];
  baseplateSize: number;
};

function PartGroup({ partId, bricks, baseplateSize }: PartGroupProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const part = useMemo(() => getPartOrDefault(partId), [partId]);
  const geometry = useMemo(() => partGeometry(part), [part]);
  const capacity = capacityFor(bricks.length);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    for (let i = 0; i < bricks.length; i++) {
      const brick = bricks[i]!;
      applyGridTransform(
        scratch,
        { part, x: brick.x, y: brick.y, z: brick.z, rot: brick.rot },
        baseplateSize,
      );
      mesh.setMatrixAt(i, scratch.matrix);
      scratchColor.setStyle(getColorOrDefault(brick.color).hex);
      mesh.setColorAt(i, scratchColor);
    }

    mesh.count = bricks.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();

    // instanceId -> brick id, read back by the pointer handlers after a raycast hit.
    mesh.userData["brickIds"] = bricks.map((b) => b.id);
  }, [bricks, part, baseplateSize, capacity]);

  if (bricks.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, capacity]}
      castShadow
      receiveShadow
      frustumCulled={false}
    >
      <meshStandardMaterial roughness={0.42} metalness={0.03} />
    </instancedMesh>
  );
}

function BrickInstancesImpl({ bricks, baseplateSize }: { bricks: Brick[]; baseplateSize: number }) {
  const groups = useMemo(() => {
    const byPart = new Map<string, Brick[]>();
    for (const brick of bricks) {
      const existing = byPart.get(brick.part);
      if (existing) existing.push(brick);
      else byPart.set(brick.part, [brick]);
    }
    return [...byPart.entries()];
  }, [bricks]);

  return (
    <group name="bricks">
      {groups.map(([partId, group]) => (
        <PartGroup key={partId} partId={partId} bricks={group} baseplateSize={baseplateSize} />
      ))}
    </group>
  );
}

/**
 * Memoised: the pointer moves far more often than the build changes, and re-running the instance
 * loop on every mouse move would be the single most expensive thing in the app.
 */
export const BrickInstances = memo(BrickInstancesImpl);

/** Resolve a raycast hit on an instanced brick mesh back to a brick id. */
export function brickIdFromHit(
  object: THREE.Object3D,
  instanceId: number | undefined,
): string | null {
  if (instanceId === undefined) return null;
  const ids = object.userData["brickIds"];
  if (!Array.isArray(ids)) return null;
  const id: unknown = ids[instanceId];
  return typeof id === "string" ? id : null;
}
