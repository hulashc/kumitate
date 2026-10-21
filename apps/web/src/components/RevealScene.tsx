"use client";

import { useMemo, useRef, type ComponentRef } from "react";
import { useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  brickProgress,
  easeOutCubic,
  getColorOrDefault,
  getPartOrDefault,
  platesToScene,
  revealOrder,
  revealTiming,
  type Brick,
} from "@kumitate/brick-core";
import { partGeometry } from "@/lib/geometry";
import { applyGridTransform } from "@/lib/transform";
import { Baseplate } from "./Baseplate";

/**
 * A build assembling itself, brick by brick.
 *
 * Each brick falls the last couple of studs into place with an ease-out, so the eye reads it as
 * being set down rather than popping in. Driven entirely from an elapsed-time clock, which means
 * the whole animation is a pure function of `elapsed` — scrubbing or replaying costs nothing.
 *
 * Shares the instanced rendering approach with the builder, but keeps its own copy of the
 * instance loop because here the matrices change every frame and the colours do not.
 */

const scratch = new THREE.Object3D();
const scratchColor = new THREE.Color();

/** How far above its resting place a brick begins its drop, in plates. */
const DROP_HEIGHT_PLATES = 9;

type GroupProps = {
  partId: string;
  /** Bricks of this part, each with its index in the overall reveal sequence. */
  entries: { brick: Brick; order: number }[];
  baseplateSize: number;
  clock: { elapsed: number };
  timing: ReturnType<typeof revealTiming>;
};

function RevealPartGroup({ partId, entries, baseplateSize, clock, timing }: GroupProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const part = useMemo(() => getPartOrDefault(partId), [partId]);
  const geometry = useMemo(() => partGeometry(part), [part]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    let drawn = 0;
    for (const { brick, order } of entries) {
      const progress = brickProgress(order, clock.elapsed, timing);
      if (progress <= 0) continue;

      const eased = easeOutCubic(progress);
      applyGridTransform(
        scratch,
        { part, x: brick.x, y: brick.y, z: brick.z, rot: brick.rot },
        baseplateSize,
      );
      // Lift the brick by the remaining fraction of its drop and fade that out as it lands.
      scratch.position.y += platesToScene(DROP_HEIGHT_PLATES) * (1 - eased);
      scratch.updateMatrix();

      mesh.setMatrixAt(drawn, scratch.matrix);
      // Instance colours are indexed by slot, so a brick that moves slot needs its colour moved
      // too. Slots only ever fill in order, so this is the brick's own colour.
      scratchColor.setStyle(getColorOrDefault(brick.color).hex);
      mesh.setColorAt(drawn, scratchColor);
      drawn++;
    }

    mesh.count = drawn;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, Math.max(1, entries.length)]}
      castShadow
      receiveShadow
      frustumCulled={false}
    >
      <meshStandardMaterial roughness={0.42} metalness={0.03} />
    </instancedMesh>
  );
}

export function RevealScene({
  bricks,
  baseplateSize,
  clock,
  spin,
}: {
  bricks: Brick[];
  baseplateSize: number;
  /** Mutable elapsed-seconds clock, advanced by the parent. */
  clock: { elapsed: number };
  spin: boolean;
}) {
  const ordered = useMemo(() => revealOrder(bricks), [bricks]);
  const timing = useMemo(() => revealTiming(ordered.length), [ordered.length]);

  const groups = useMemo(() => {
    const byPart = new Map<string, { brick: Brick; order: number }[]>();
    ordered.forEach((brick, order) => {
      const entry = { brick, order };
      const existing = byPart.get(brick.part);
      if (existing) existing.push(entry);
      else byPart.set(brick.part, [entry]);
    });
    return [...byPart.entries()];
  }, [ordered]);

  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);

  // A slow orbit while the build assembles; it stops the moment the viewer grabs the camera.
  useFrame((_, delta) => {
    if (!spin) return;
    const controls = controlsRef.current;
    if (controls) controls.setAzimuthalAngle(controls.getAzimuthalAngle() + delta * 0.12);
  });

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
        shadow-bias={-0.0008}
      />
      <directionalLight position={[-14, 12, -16]} intensity={0.45} />

      <Baseplate size={baseplateSize} />

      {groups.map(([partId, entries]) => (
        <RevealPartGroup
          key={partId}
          partId={partId}
          entries={entries}
          baseplateSize={baseplateSize}
          clock={clock}
          timing={timing}
        />
      ))}

      <OrbitControls
        ref={controlsRef}
        makeDefault
        target={[0, 1.5, 0]}
        enableDamping
        dampingFactor={0.12}
        enablePan={false}
        minDistance={6}
        maxDistance={90}
        maxPolarAngle={Math.PI / 2 - 0.05}
      />
    </>
  );
}

/** Total seconds the assembly takes, so the caller knows when to show the letter. */
export function revealDuration(bricks: readonly Brick[]): number {
  return revealTiming(bricks.length).total;
}
