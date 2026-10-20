/**
 * Grid -> scene transforms.
 *
 * The only place integer grid coordinates become floats. Part geometry is centred on its
 * footprint in X/Z with its base at y = 0, so placing a brick means rotating about the centre
 * and translating to the centre of its *rotated* world footprint.
 */

import type * as THREE from "three";
import { platesToScene, rotatedFootprint, type Part, type Rotation } from "@kumitate/brick-core";

export type GridTransform = {
  part: Part;
  x: number;
  y: number;
  z: number;
  rot: Rotation;
};

/**
 * Position and orient `target` to match a grid placement, then refresh its local matrix.
 *
 * Reuse one scratch `Object3D` across a whole instance loop rather than allocating per brick.
 */
export function applyGridTransform(
  target: THREE.Object3D,
  { part, x, y, z, rot }: GridTransform,
  baseplateSize: number,
): void {
  const { width, depth } = rotatedFootprint(part, rot);
  const half = baseplateSize / 2;

  target.position.set(x + width / 2 - half, platesToScene(y), z + depth / 2 - half);
  // Rotation 1 is a quarter turn that carries +Z onto +X, which is three.js's positive Y spin.
  target.rotation.set(0, (rot * Math.PI) / 2, 0);
  target.scale.set(1, 1, 1);
  target.updateMatrix();
}

/** Convert a world-space point on the build surface to the grid cell under it. */
export function worldPointToCell(
  pointX: number,
  pointZ: number,
  baseplateSize: number,
): { x: number; z: number } {
  const half = baseplateSize / 2;
  return { x: Math.floor(pointX + half), z: Math.floor(pointZ + half) };
}
