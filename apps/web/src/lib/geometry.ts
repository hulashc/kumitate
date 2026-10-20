/**
 * Procedural brick geometry.
 *
 * Phase 1 builds every part from primitives — a box (or cylinder, or extruded slope) for the
 * body, plus a cylinder per stud — and merges them into one `BufferGeometry` per part. One
 * geometry per part means one `InstancedMesh` per part, which is what keeps a 2,000 brick scene
 * at a handful of draw calls. PLAN.md Phase 4 swaps these for real LDraw meshes; because the
 * cache is keyed by LDraw part ID, nothing else has to change.
 *
 * Local frame of every geometry:
 *   - centred on the footprint in X and Z, so a brick can be rotated about its own centre
 *   - bottom face at y = 0, growing upward
 *   - studs included, protruding above the top face
 */

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  LDU_PER_PLATE,
  LDU_PER_STUD,
  SCENE_UNITS_PER_LDU,
  localStudCells,
  platesToScene,
  type Part,
} from "@kumitate/brick-core";

/** Convert a measurement in LDraw units to scene units. */
const ldu = (n: number): number => n * SCENE_UNITS_PER_LDU;

/**
 * Half the gap left between neighbouring bricks, in LDU.
 *
 * Real bricks are very slightly narrower than their 20 LDU pitch. Reproducing that gives every
 * joint a visible seam, which does more for readability than any amount of extra lighting.
 */
const SEAM_LDU = 0.4;

/** LDraw stud dimensions. */
const STUD_RADIUS_LDU = 6;
const STUD_HEIGHT_LDU = 4;

/** Radius of a 1x1 round part. */
const ROUND_RADIUS_LDU = 10;

/**
 * How deep the flat top of a 45-degree slope is, in LDU.
 *
 * The rest of the depth is the slope face itself. For a 2x2 slope one brick tall: 40 LDU deep
 * total, 24 LDU of that is the 45-degree run (matching the 24 LDU height), leaving 16 LDU of
 * flat top — just enough to seat the studs.
 */
const SLOPE_FLAT_LDU = 16;

const RADIAL_SEGMENTS = 16;

/** Cached merged geometry per part ID. Geometries are immutable and shared by every instance. */
const geometryCache = new Map<string, THREE.BufferGeometry>();

/**
 * Merge a list of primitives into one geometry.
 *
 * Everything is converted to non-indexed first: `mergeGeometries` refuses to mix indexed
 * primitives (box, cylinder) with non-indexed ones (the extruded slope), and the vertex count
 * here is far too small for the index buffer to be worth keeping.
 */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const nonIndexed = parts.map((g) => {
    const flat = g.index ? g.toNonIndexed() : g;
    if (flat !== g) g.dispose();
    return flat;
  });

  const merged = mergeGeometries(nonIndexed, false);
  if (!merged) {
    throw new Error("Failed to merge brick geometry — mismatched vertex attributes");
  }
  for (const g of nonIndexed) g.dispose();

  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/** A single stud, positioned with its base on `topY`. */
function studGeometry(centerX: number, topY: number, centerZ: number): THREE.BufferGeometry {
  const height = ldu(STUD_HEIGHT_LDU);
  const stud = new THREE.CylinderGeometry(
    ldu(STUD_RADIUS_LDU),
    ldu(STUD_RADIUS_LDU),
    height,
    RADIAL_SEGMENTS,
  );
  stud.translate(centerX, topY + height / 2, centerZ);
  return stud;
}

/** The body of a plain rectangular part. */
function boxBody(part: Part): THREE.BufferGeometry {
  const width = part.width * ldu(LDU_PER_STUD) - ldu(SEAM_LDU) * 2;
  const depth = part.depth * ldu(LDU_PER_STUD) - ldu(SEAM_LDU) * 2;
  const height = platesToScene(part.height);

  const body = new THREE.BoxGeometry(width, height, depth);
  body.translate(0, height / 2, 0);
  return body;
}

/** The body of a 1x1 round part. */
function cylinderBody(part: Part): THREE.BufferGeometry {
  const radius = ldu(ROUND_RADIUS_LDU - SEAM_LDU);
  const height = platesToScene(part.height);

  const body = new THREE.CylinderGeometry(radius, radius, height, RADIAL_SEGMENTS);
  body.translate(0, height / 2, 0);
  return body;
}

/**
 * The body of a 45-degree slope: a prism whose profile is flat across the high edge and then
 * falls away at 45 degrees.
 *
 * The profile is drawn in the extruder's XY plane and then turned a quarter turn about Y, which
 * maps the shape's X onto the world's -Z and the extrusion depth onto the world's X.
 */
function slopeBody(part: Part): THREE.BufferGeometry {
  const halfDepth = (part.depth * ldu(LDU_PER_STUD)) / 2 - ldu(SEAM_LDU);
  const width = part.width * ldu(LDU_PER_STUD) - ldu(SEAM_LDU) * 2;
  const height = platesToScene(part.height);
  const flatEnd = -halfDepth + ldu(SLOPE_FLAT_LDU);

  // Shape X is the negated world Z, so the high edge (world z = -halfDepth) is at shape x = +h.
  const profile = new THREE.Shape();
  profile.moveTo(halfDepth, 0); // bottom of the high edge
  profile.lineTo(halfDepth, height); // up the high face
  profile.lineTo(-flatEnd, height); // across the flat top
  profile.lineTo(-halfDepth, 0); // down the 45-degree slope
  profile.closePath();

  const body = new THREE.ExtrudeGeometry(profile, { depth: width, bevelEnabled: false });
  body.rotateY(Math.PI / 2);
  body.translate(-width / 2, 0, 0);
  return body;
}

function buildPartGeometry(part: Part): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];

  switch (part.shape) {
    case "box":
      pieces.push(boxBody(part));
      break;
    case "cylinder":
      pieces.push(cylinderBody(part));
      break;
    case "slope":
      pieces.push(slopeBody(part));
      break;
  }

  // Stud centres sit at the middle of each footprint cell, measured from the centred origin.
  const halfWidth = (part.width * ldu(LDU_PER_STUD)) / 2;
  const halfDepth = (part.depth * ldu(LDU_PER_STUD)) / 2;
  const topY = platesToScene(part.height);

  for (const [cellX, cellZ] of localStudCells(part)) {
    const x = -halfWidth + (cellX + 0.5) * ldu(LDU_PER_STUD);
    const z = -halfDepth + (cellZ + 0.5) * ldu(LDU_PER_STUD);
    pieces.push(studGeometry(x, topY, z));
  }

  return merge(pieces);
}

/** The merged geometry for a part, built once and cached. */
export function partGeometry(part: Part): THREE.BufferGeometry {
  const cached = geometryCache.get(part.id);
  if (cached) return cached;

  const built = buildPartGeometry(part);
  geometryCache.set(part.id, built);
  return built;
}

/**
 * Studs covering the top of the baseplate, merged into one geometry.
 *
 * Centred on the origin like the slab itself, with stud bases at y = 0.
 */
export function baseplateStudGeometry(size: number): THREE.BufferGeometry {
  const studs: THREE.BufferGeometry[] = [];
  const half = size / 2;
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      studs.push(studGeometry(-half + x + 0.5, 0, -half + z + 0.5));
    }
  }
  return merge(studs);
}

/** Scene-space height of a stud, for positioning things that sit on one. */
export const STUD_HEIGHT_SCENE = ldu(STUD_HEIGHT_LDU);

/** Scene-space height of a single plate, re-exported for renderer convenience. */
export const PLATE_HEIGHT_SCENE = ldu(LDU_PER_PLATE);
