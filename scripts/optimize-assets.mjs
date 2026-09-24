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
import { NodeIO } from '@gltf-transform/core';
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

// Uso: node scripts/optimize-assets.mjs [asteroids|water|ufo|taxi|planets ...]
const STEPS = { asteroids, water: waterDrop, ufo, taxi, planets: planetTextures };
const wanted = process.argv.slice(2).filter(a => STEPS[a]);
await mkdir(OUT, { recursive: true });
for (const [name, fn] of Object.entries(STEPS)) {
  if (!wanted.length || wanted.includes(name)) await fn();
}
console.log('Listo.');
