"use client";

import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { getColorOrDefault, type PlacedTemplateBrick } from "@kumitate/brick-core";
import { partGeometry } from "@/lib/geometry";
import { applyGridTransform } from "@/lib/transform";

const BLOCKED_COLOR = new THREE.Color("#E53935");

/**
 * Preview of a whole template about to be stamped down.
 *
 * Each brick is drawn in its own colour so you can see what you are getting, except when the
 * placement is blocked, in which case the lot turns red — a template is placed all-or-nothing,
 * so a per-brick verdict would be misleading.
 */
export function TemplateGhost({
  bricks,
  valid,
  baseplateSize,
}: {
  bricks: PlacedTemplateBrick[];
  valid: boolean;
  baseplateSize: number;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.children.forEach((child, index) => {
      const brick = bricks[index];
      if (!brick) return;
      child.matrixAutoUpdate = false;
      applyGridTransform(
        child,
        { part: brick.part, x: brick.x, y: brick.y, z: brick.z, rot: brick.rot },
        baseplateSize,
      );
    });
  }, [bricks, baseplateSize]);

  return (
    <group ref={groupRef} name="template-ghost">
      {bricks.map((brick, index) => (
        <mesh key={index} geometry={partGeometry(brick.part)} raycast={() => null}>
          <meshStandardMaterial
            color={valid ? getColorOrDefault(brick.color).hex : BLOCKED_COLOR}
            transparent
            opacity={valid ? 0.55 : 0.45}
            roughness={0.4}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}
