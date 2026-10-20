"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { platesToScene } from "@kumitate/brick-core";
import { baseplateStudGeometry } from "@/lib/geometry";

const SLAB_HEIGHT = platesToScene(1);
const SLAB_COLOR = "#7C8B96";

/**
 * The baseplate: a slab whose top face is exactly y = 0 (so grid plate 0 rests on it), plus a
 * merged grid of studs.
 *
 * The slab is centred on the origin, so world X = gridX - size / 2.
 */
export function Baseplate({ size }: { size: number }) {
  const studs = useMemo(() => baseplateStudGeometry(size), [size]);

  return (
    // The baseplate is deliberately not raycastable. BuildScene puts a single invisible plane at
    // y = 0 to resolve pointer position, so hits are either "a brick" or "the build surface" —
    // never an ambiguous tie between the slab top and that plane.
    <group>
      <mesh position={[0, -SLAB_HEIGHT / 2, 0]} receiveShadow raycast={() => null}>
        <boxGeometry args={[size, SLAB_HEIGHT, size]} />
        <meshStandardMaterial color={SLAB_COLOR} roughness={0.75} metalness={0.02} />
      </mesh>

      <mesh geometry={studs} receiveShadow castShadow raycast={() => null}>
        <meshStandardMaterial color={SLAB_COLOR} roughness={0.75} metalness={0.02} />
      </mesh>

      {/* A faint outline makes the build area's edge readable from a shallow camera angle. */}
      <lineSegments position={[0, 0.002, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2)]} />
        <lineBasicMaterial color="#4A5A66" />
      </lineSegments>
    </group>
  );
}
