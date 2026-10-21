"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Billboard, Text } from "@react-three/drei";
import { getPartOrDefault, platesToScene, rotatedFootprint } from "@kumitate/brick-core";
import { partGeometry } from "@/lib/geometry";
import { applyGridTransform } from "@/lib/transform";
import type { Peer } from "@/lib/presence";

/**
 * Other people's ghost bricks and name tags.
 *
 * Each peer's ghost is drawn in *their* presence colour rather than the brick colour they have
 * selected: in a shared room, knowing who is about to place something matters more than knowing
 * what shade it will be.
 */

function PeerGhost({ peer, baseplateSize }: { peer: Peer; baseplateSize: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const ghost = peer.ghost;
  const cursor = peer.cursor;

  const part = useMemo(() => getPartOrDefault(ghost?.part ?? ""), [ghost?.part]);
  const geometry = useMemo(() => partGeometry(part), [part]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !ghost || !cursor) return;
    mesh.matrixAutoUpdate = false;
    applyGridTransform(
      mesh,
      { part, x: cursor.x, y: cursor.y, z: cursor.z, rot: ghost.rot },
      baseplateSize,
    );
  }, [part, ghost, cursor, baseplateSize]);

  const label = useMemo(() => {
    if (!cursor) return null;
    const { width, depth } = rotatedFootprint(part, ghost?.rot ?? 0);
    const half = baseplateSize / 2;
    return new THREE.Vector3(
      cursor.x + width / 2 - half,
      platesToScene(cursor.y + part.height) + 1.1,
      cursor.z + depth / 2 - half,
    );
  }, [cursor, part, ghost?.rot, baseplateSize]);

  if (!ghost || !cursor) return null;

  return (
    <group>
      <mesh ref={meshRef} geometry={geometry} raycast={() => null}>
        <meshStandardMaterial
          color={peer.user.color}
          transparent
          opacity={0.4}
          roughness={0.5}
          depthWrite={false}
        />
      </mesh>

      {label && (
        <Billboard position={label}>
          <Text
            fontSize={0.78}
            color={peer.user.color}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.06}
            outlineColor="#0B121A"
          >
            {peer.user.name}
          </Text>
        </Billboard>
      )}
    </group>
  );
}

export function PeerGhosts({ peers, baseplateSize }: { peers: Peer[]; baseplateSize: number }) {
  return (
    <group name="peers">
      {peers.map((peer) => (
        <PeerGhost key={peer.clientId} peer={peer} baseplateSize={baseplateSize} />
      ))}
    </group>
  );
}
