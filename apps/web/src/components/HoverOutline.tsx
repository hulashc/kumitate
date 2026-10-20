"use client";

import { useMemo } from "react";
import * as THREE from "three";
import {
  platesToScene,
  rotatedFootprint,
  type Brick,
  getPartOrDefault,
} from "@kumitate/brick-core";

/**
 * Wireframe box around the brick under the pointer, showing what Delete or right-click will
 * remove.
 *
 * Drawn as an overlay rather than by tinting the instance, so hovering costs one small mesh
 * update instead of a rewrite of the whole instance buffer.
 */
export function HoverOutline({ brick, baseplateSize }: { brick: Brick; baseplateSize: number }) {
  const { position, scale } = useMemo(() => {
    const part = getPartOrDefault(brick.part);
    const { width, depth } = rotatedFootprint(part, brick.rot);
    const height = platesToScene(part.height);
    const half = baseplateSize / 2;

    return {
      position: [
        brick.x + width / 2 - half,
        platesToScene(brick.y) + height / 2,
        brick.z + depth / 2 - half,
      ] as const,
      scale: [width, height, depth] as const,
    };
  }, [brick, baseplateSize]);

  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);

  return (
    <lineSegments
      geometry={edges}
      position={[position[0], position[1], position[2]]}
      scale={[scale[0] * 1.03, scale[1] * 1.03, scale[2] * 1.03]}
      raycast={() => null}
    >
      <lineBasicMaterial color="#FFFFFF" transparent opacity={0.9} depthTest={false} />
    </lineSegments>
  );
}
