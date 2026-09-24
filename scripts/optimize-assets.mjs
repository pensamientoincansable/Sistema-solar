#!/usr/bin/env node
/**
 * optimize-assets.mjs — Genera versiones ligeras (web/móvil) de los modelos
 * originales de /assets y las deja en /public/models (que Vite copia a dist/).
 *
 * Los originales de /assets NO se modifican: son los "masters" subidos al repo.
 * Sin esta optimización el juego descargaría ~75 MB y subiría a la GPU
 * texturas de 4096² (≈256 MB solo los asteroides), lo que cierra el navegador
 * en la mayoría de móviles Android.
 *
 * Qué hace:
 *   - Texturas redimensionadas (512–1024 px) y recodificadas a JPEG.
 *   - Se eliminan tangentes (Three.js las calcula en el shader) y extensiones
 *     caras o no soportadas (KHR_materials_specular -> MeshPhysicalMaterial,
 *     KHR_materials_pbrSpecularGlossiness -> eliminada en three r147+).
 *   - La gota de agua (3 × 20k vértices) se simplifica con meshoptimizer.
 *   - Versiones 1024×512 de las texturas planetarias para móviles.
 *
 * Uso (las herramientas no forman parte de package.json para no cargar el CI):
 *   npm i --no-save @gltf-transform/core@4 @gltf-transform/extensions@4 \
 *       @gltf-transform/functions@4 sharp meshoptimizer
 *   node scripts/optimize-assets.mjs
 */
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'assets');
const OUT = path.join(ROOT, 'public', 'models');

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function removeExtension(doc, name) {
  const ext = doc.getRoot().listExtensionsUsed().find(e => e.extensionName === name);
  if (ext) ext.dispose();
}

function stripAttributes(doc, names) {
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      for (const n of names) {
        const acc = prim.getAttribute(n);
        if (acc) prim.setAttribute(n, null);
      }
    }
  }
}

async function compressTextures(doc, rules) {
  // rules: [{ slots: RegExp, size: number, quality: number }]
  for (const r of rules) {
    await doc.transform(textureCompress({
      encoder: sharp,
      targetFormat: 'jpeg',
      slots: r.slots,
      resize: [r.size, r.size],
      quality: r.quality,
    }));
  }
}

async function finish(doc, file) {
  await doc.transform(prune(), dedup());
  const out = path.join(OUT, file);
  await io.write(out, doc);
  const s = await stat(out);
  console.log(`  -> public/models/${file}  ${(s.size / 1024).toFixed(0)} KB`);
}

async function asteroids() {
  console.log('asteroides');
  const doc = await io.read(path.join(SRC, 'asteroides', 'scene.gltf'));
  stripAttributes(doc, ['TANGENT']);
  await compressTextures(doc, [
    { slots: /baseColor/, size: 1024, quality: 82 },
    { slots: /normal/, size: 1024, quality: 88 },
    { slots: /metallicRoughness|occlusion/, size: 512, quality: 80 },
  ]);
  await finish(doc, 'asteroids.glb');
}

async function waterDrop() {
  console.log('drop_of_water');
  const doc = await io.read(path.join(SRC, 'drop_of_water', 'scene.gltf'));
  // Material Specular-Glossiness (no soportado por three r160): se sustituye
  // por un metal-roughness equivalente; en el juego se usa un material propio.
  removeExtension(doc, 'KHR_materials_pbrSpecularGlossiness');
  for (const m of doc.getRoot().listMaterials()) {
    m.setBaseColorFactor([0.25, 0.62, 1.0, 0.72]);
    m.setAlphaMode('BLEND');
    m.setRoughnessFactor(0.05);
    m.setMetallicFactor(0.0);
  }
  stripAttributes(doc, ['TEXCOORD_0', 'TANGENT']);
  // Se dibujan ~40-110 gotas con InstancedMesh: ~120 triángulos por malla
  // bastan para una gota que ocupa pocos píxeles (antes 1188 -> 320k triángulos
  // por frame solo en gotas).
  await doc.transform(
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: 0.003, error: 0.03 }),
  );
  await finish(doc, 'water_drop.glb');
}

async function ufo() {
  console.log('nave_espacial_ufo');
  const doc = await io.read(path.join(SRC, 'nave_espacial_ufo', 'scene.gltf'));
  // KHR_materials_specular obliga a MeshPhysicalMaterial (más caro en móvil).
  removeExtension(doc, 'KHR_materials_specular');
  stripAttributes(doc, ['TANGENT']);
  await compressTextures(doc, [
    { slots: /baseColor|emissive/, size: 512, quality: 84 },
    { slots: /normal/, size: 512, quality: 88 },
    { slots: /metallicRoughness/, size: 256, quality: 80 },
  ]);
  await finish(doc, 'ufo.glb');
}

async function taxi() {
  console.log('b90_taxi_the_fifth_element');
  const doc = await io.read(path.join(SRC, 'b90_taxi_the_fifth_element', 'scene.gltf'));
  stripAttributes(doc, ['TANGENT']);
  await compressTextures(doc, [
    { slots: /baseColor/, size: 1024, quality: 84 },
    { slots: /emissive/, size: 512, quality: 84 },
    { slots: /normal/, size: 512, quality: 88 },
    { slots: /metallicRoughness/, size: 512, quality: 80 },
  ]);
  await finish(doc, 'taxi.glb');
}

async function planetTextures() {
  console.log('texturas planetarias (versión móvil 1024x512)');
  const srcDir = path.join(ROOT, 'public', 'textures');
  const outDir = path.join(srcDir, 'lowres');
  await mkdir(outDir, { recursive: true });
  const files = (await readdir(srcDir)).filter(f => /_baseColor\.jpe?g$/.test(f));
  for (const f of files) {
    const out = path.join(outDir, f);
    await sharp(path.join(srcDir, f))
      .resize(1024, 512, { fit: 'fill' })
      .jpeg({ quality: 80, mozjpeg: true })
      .toFile(out);
    const s = await stat(out);
    console.log(`  -> public/textures/lowres/${f}  ${(s.size / 1024).toFixed(0)} KB`);
  }
}

/**
 * Genera una esfera metálica pequeña si el master descargado no trae su .bin.
 * El glTF de `assets/esferas metal` referencia IridescenceMetallicSpheres.bin,
 * pero ese binario no forma parte del repositorio. No dejamos que un asset roto
 * rompa el build: la geometría equivalente se genera de forma determinista y
 * sigue pasando por el mismo pipeline GLB ligero.
 */
function makeMetalFallback() {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const segments = 16;
  const rings = 8;
  const positions = [];
  const normals = [];
  const indices = [];
  for (let y = 0; y <= rings; y++) {
    const v = y / rings;
    const phi = v * Math.PI;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    for (let x = 0; x <= segments; x++) {
      const u = x / segments;
      const theta = u * Math.PI * 2;
      const nx = sinPhi * Math.cos(theta);
      const ny = cosPhi;
      const nz = sinPhi * Math.sin(theta);
      positions.push(nx, ny, nz);
      normals.push(nx, ny, nz);
    }
  }
  for (let y = 0; y < rings; y++) {
    for (let x = 0; x < segments; x++) {
      const a = y * (segments + 1) + x;
      const b = a + segments + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const position = doc.createAccessor('POSITION').setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer);
  const normal = doc.createAccessor('NORMAL').setType('VEC3').setArray(new Float32Array(normals)).setBuffer(buffer);
  const index = doc.createAccessor('INDICES').setType('SCALAR').setArray(new Uint16Array(indices)).setBuffer(buffer);
  const material = doc.createMaterial('Metal resource')
    .setBaseColorFactor([0.42, 0.47, 0.55, 1])
    .setMetallicFactor(0.9)
    .setRoughnessFactor(0.2);
  const primitive = doc.createPrimitive()
    .setAttribute('POSITION', position)
    .setAttribute('NORMAL', normal)
    .setIndices(index)
    .setMaterial(material);
  const mesh = doc.createMesh('Metal sphere').addPrimitive(primitive);
  const node = doc.createNode('Metal sphere').setMesh(mesh);
  doc.createScene('Scene').addChild(node);
  return doc;
}

const RESOURCE_ASSETS = {
  metal: {
    source: path.join(SRC, 'esferas metal', 'IridescenceMetallicSpheres.gltf'),
    output: 'metal_sphere.glb',
    fallback: true,
    extensions: ['KHR_materials_iridescence'],
    simplifyRatio: 0.22,
  },
  glass: {
    source: path.join(SRC, 'glass_sphere', 'scene.gltf'),
    output: 'glass_sphere.glb',
    extensions: ['KHR_materials_pbrSpecularGlossiness'],
    simplifyRatio: 0.18,
  },
  polymer: {
    source: path.join(SRC, 'polímero', 'scene.gltf'),
    output: 'polymer.glb',
    simplifyRatio: 0.2,
  },
  bio: {
    source: path.join(SRC, 'musgo', 'scene.gltf'),
    output: 'moss.glb',
    simplifyRatio: 0.45,
  },
};

async function resourceAssets() {
  console.log('recursos recolectables (metal, vidrio, polímero y biomasa)');
  for (const [kind, rule] of Object.entries(RESOURCE_ASSETS)) {
    let doc;
    try {
      doc = await io.read(rule.source);
    } catch (error) {
      if (!rule.fallback) throw error;
      console.warn(`  ! ${kind}: falta el binario del master; se genera una esfera optimizada de respaldo`);
      doc = makeMetalFallback();
    }
    for (const extension of rule.extensions || []) removeExtension(doc, extension);
    stripAttributes(doc, ['TANGENT']);
    for (const material of doc.getRoot().listMaterials()) {
      if (kind === 'glass') {
        material.setBaseColorFactor([0.35, 0.82, 1.0, 0.42]);
        material.setAlphaMode('BLEND');
        material.setMetallicFactor(0.05);
        material.setRoughnessFactor(0.08);
      } else if (kind === 'metal') {
        material.setMetallicFactor(0.82);
        material.setRoughnessFactor(0.24);
      }
    }
    if (kind === 'bio') {
      await compressTextures(doc, [{ slots: /baseColor/, size: 256, quality: 78 }, { slots: /metallicRoughness|normal/, size: 256, quality: 76 }]);
    }
    await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: rule.simplifyRatio, error: 0.02 }));
    await finish(doc, rule.output);
  }
}

// Uso: node scripts/optimize-assets.mjs [asteroids|water|ufo|taxi|planets|resources ...]
const STEPS = {
  asteroids, water: waterDrop, ufo, taxi, planets: planetTextures, resources: resourceAssets,
};
const wanted = process.argv.slice(2).filter(a => STEPS[a]);
await mkdir(OUT, { recursive: true });
for (const [name, fn] of Object.entries(STEPS)) {
  if (!wanted.length || wanted.includes(name)) await fn();
}
console.log('Listo.');
