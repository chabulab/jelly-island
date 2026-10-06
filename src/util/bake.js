import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Merge static child meshes of `root` into ONE mesh (fewer draw calls / shadow passes).
 * Each source mesh's material colour is baked into a vertex-colour attribute (multiplied with any existing
 * vertex colours), so many small single-colour parts can share one MeshStandardMaterial.
 * Textured meshes, instanced meshes and anything rejected by `filter` are left alone.
 *
 * @param {THREE.Object3D} root
 * @param {{deep?: boolean, filter?: (m: THREE.Mesh) => boolean, castShadow?: boolean, receiveShadow?: boolean,
 *          material?: THREE.Material, name?: string}} [opts]
 *   deep=false: only direct children of root (use for rigs where child groups animate).
 * @returns {THREE.Mesh|null} the merged mesh (added to root), or null if there was nothing to merge
 */
export function bake(root, { deep = true, filter = null, castShadow = true, receiveShadow = true, material = null, name = 'baked' } = {}) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const found = [];
  const visit = (o) => {
    for (const ch of o.children) {
      if (ch.isMesh && !ch.isInstancedMesh && !ch.isSkinnedMesh && !ch.material.map && (!filter || filter(ch))) found.push(ch);
      if (deep && !ch.isMesh) visit(ch);
    }
  };
  visit(root);
  if (found.length < 2) return null;

  const geos = [];
  let rough = 0, double = false;
  const m4 = new THREE.Matrix4();
  for (const mesh of found) {
    let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    const keep = { position: g.attributes.position, normal: g.attributes.normal, color: g.attributes.color };
    if (!keep.normal) { g.computeVertexNormals(); keep.normal = g.attributes.normal; }
    const n = keep.position.count, col = new Float32Array(n * 3), mc = mesh.material.color ?? new THREE.Color(1, 1, 1);
    for (let i = 0; i < n; i++) {
      const r = keep.color ? keep.color.getX(i) : 1, gg = keep.color ? keep.color.getY(i) : 1, b = keep.color ? keep.color.getZ(i) : 1;
      col[i * 3] = r * mc.r; col[i * 3 + 1] = gg * mc.g; col[i * 3 + 2] = b * mc.b;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', keep.position.clone());
    out.setAttribute('normal', keep.normal.clone());
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.applyMatrix4(m4.multiplyMatrices(inv, mesh.matrixWorld));
    geos.push(out);
    rough += mesh.material.roughness ?? 0.7;
    double ||= mesh.material.side === THREE.DoubleSide;
    mesh.parent.remove(mesh);
  }
  const merged = mergeGeometries(geos, false);
  const mat = material ?? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough / found.length, side: double ? THREE.DoubleSide : THREE.FrontSide });
  const out = new THREE.Mesh(merged, mat);
  out.name = name;
  out.castShadow = castShadow;
  out.receiveShadow = receiveShadow;
  root.add(out);
  return out;
}
