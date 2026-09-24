import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries, deinterleaveGeometry } from 'three/addons/utils/BufferGeometryUtils.js';
import { assetUrl } from './assets.js';

/**
 * ModelLibrary - Carga única (con caché) de los modelos GLB optimizados.
 *
 * Los originales viven en /assets (masters subidos al repo) y
 * scripts/optimize-assets.mjs genera las versiones ligeras en public/models.
 * Si un modelo no carga, la promesa se resuelve con null y cada entidad usa
 * su geometría procedural de respaldo: el juego nunca se bloquea por un asset.
 */
export const MODELS = {
  asteroids: 'models/asteroids.glb',   // assets/asteroides
  waterDrop: 'models/water_drop.glb',  // assets/drop_of_water
  ufo: 'models/ufo.glb',               // assets/nave_espacial_ufo
  taxi: 'models/taxi.glb',             // assets/b90_taxi_the_fifth_element
};

const loader = new GLTFLoader();
const cache = new Map();

export function loadModel(key) {
  if (cache.has(key)) return cache.get(key);
  const path = MODELS[key];
  const p = new Promise((resolve) => {
    if (!path) { resolve(null); return; }
    loader.load(
      assetUrl(path),
      (gltf) => resolve(gltf),
      undefined,
      (err) => {
        console.warn(`[ModelLibrary] No se pudo cargar ${path}; se usará el modelo de respaldo`, err);
        resolve(null);
      }
    );
  });
  cache.set(key, p);
  return p;
}

/** Empieza a descargar todos los modelos en paralelo (no bloquea). */
export function preloadAll() {
  return Promise.all(Object.keys(MODELS).map(loadModel));
}

/**
 * Envuelve un objeto en un grupo escalado para que su dimensión mayor mida
 * `size` unidades y quede centrado en el origen.
 */
export function normalizeObject(object, size) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const dims = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(dims.x, dims.y, dims.z) || 1;
  const k = size / maxDim;
  const inner = new THREE.Group();
  inner.add(object);
  object.position.sub(center);
  const wrapper = new THREE.Group();
  wrapper.add(inner);
  inner.scale.setScalar(k);
  wrapper.userData.dimensions = dims.multiplyScalar(k);
  return wrapper;
}

/**
 * Extrae cada malla del GLTF con su transformación horneada y centrada en el
 * origen, normalizada a radio 1. Útil para el pack de asteroides (10 rocas
 * repartidas en una cuadrícula dentro del mismo fichero).
 */
export function extractCenteredGeometries(gltf) {
  const out = [];
  if (!gltf || !gltf.scene) return out;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    g.computeBoundingBox();
    const c = g.boundingBox.getCenter(new THREE.Vector3());
    g.translate(-c.x, -c.y, -c.z);
    g.computeBoundingSphere();
    const r = g.boundingSphere.radius || 1;
    g.scale(1 / r, 1 / r, 1 / r);
    g.computeBoundingSphere();
    out.push({ geometry: g, material: o.material });
  });
  return out;
}

/**
 * Fusiona todas las mallas del GLTF en una sola geometría (transformaciones
 * horneadas), centrada y con su dimensión mayor = `size`. Ideal para
 * InstancedMesh (la gota de agua: gota principal + dos gotitas).
 */
export function mergeToSingleGeometry(gltf, size = 1) {
  if (!gltf || !gltf.scene) return null;
  const parts = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry.clone();
    // Los GLB optimizados usan atributos entrelazados: mergeGeometries no los admite
    deinterleaveGeometry(g);
    // Solo necesitamos posición + normal (material propio)
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    }
    g.applyMatrix4(o.matrixWorld);
    parts.push(g);
  });
  if (!parts.length) return null;
  const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  if (!merged) return null;
  merged.computeBoundingBox();
  const c = merged.boundingBox.getCenter(new THREE.Vector3());
  const dims = merged.boundingBox.getSize(new THREE.Vector3());
  merged.translate(-c.x, -c.y, -c.z);
  const k = size / (Math.max(dims.x, dims.y, dims.z) || 1);
  merged.scale(k, k, k);
  merged.computeBoundingSphere();
  return merged;
}
