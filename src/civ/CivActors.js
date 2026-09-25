/**
 * CivActors - Los civiles: gente pequeña, no fichas.
 *
 * Cada civil se arma con primitivas (torso, cabeza con pelo y ojos, brazos,
 * piernas, herramienta) y se anima con un ciclo de andar sencillo: piernas y
 * brazos alternos, balanceo del cuerpo, inclinación y respiración. El tono de
 * piel, el pelo y la ropa varían por unidad para que no parezcan clones.
 *
 * En `lowres` (móvil) todo se fusiona en una sola malla sin animación de
 * miembros: misma silueta, un draw call por civil.
 */
import * as THREE from 'three';
import { PartList } from './CivAssets.js';
import { UNIT_LOOK, SKIN_TONES, HAIR_TONES } from './CivConfig.js';

/** Medidas de referencia (unidades del mundo). */
const M = {
  hip: 0.8, torsoTop: 1.35, shoulderY: 1.28, shoulderX: 0.24,
  headY: 1.6, headR: 0.21, armLen: 0.62, legLen: 0.8,
};

const EYE = 0x1a1a22;
const BOOT = 0x3a2f26;

/** Herramientas: se fusionan con el brazo derecho para que oscilen con él. */
function tool(list, assets, kind) {
  const b = (x, y, z, sx, sy, sz, color, ry = 0) => list.add(assets.geo('box'), { x, y, z, sx, sy, sz, color, ry });
  const c = (y, h, r, color) => list.add(assets.geo('cylLow'), { y, sx: r * 2, sy: h, sz: r * 2, color });
  switch (kind) {
    case 'axe':
      c(0, 0.62, 0.03, 0x7a5230);
      b(0.02, 0.24, 0, 0.2, 0.22, 0.05, 0xd8dde4);
      break;
    case 'pickaxe':
      c(0, 0.66, 0.03, 0x7a5230);
      b(0, 0.26, 0, 0.46, 0.06, 0.06, 0xb9c0c9);
      break;
    case 'hammer':
      c(0, 0.5, 0.035, 0x8a5a2b);
      b(0, 0.22, 0, 0.22, 0.14, 0.14, 0x9aa2ac);
      break;
    case 'hoe':
      c(0, 0.72, 0.028, 0x8a5a2b);
      b(0, 0.32, 0.06, 0.06, 0.05, 0.26, 0xb9c0c9);
      break;
    case 'tablet':
      b(0, 0.16, 0.02, 0.24, 0.3, 0.04, 0x22303c);
      b(0, 0.16, 0.05, 0.19, 0.24, 0.02, 0x7ff0ff);
      break;
    case 'rifle':
      b(0, 0.14, 0.06, 0.07, 0.14, 0.62, 0x2b2f36);
      b(0, 0.05, 0.2, 0.06, 0.1, 0.24, 0x4a4136);
      break;
    default:
      break;
  }
}

/** Cabeza: pelo, ojos y gorro/casco según el papel. */
function headParts(kit, o) {
  kit.add(o.assets.geo('head'), { y: M.headY, color: o.skin });
  kit.add(o.assets.geo('hair'), { y: M.headY + 0.015, color: o.hair });
  // Ojos (ligeramente hacia delante, +Z es el frente)
  kit.add(o.assets.geo('eye'), { x: -0.075, y: M.headY + 0.02, z: 0.185, color: EYE });
  kit.add(o.assets.geo('eye'), { x: 0.075, y: M.headY + 0.02, z: 0.185, color: EYE });
  if (o.hat === 'helmet') {
    kit.add(o.assets.geo('halfSphere'), { y: M.headY + 0.02, sx: 0.52, sy: 0.3, sz: 0.52, color: 0xf0c020 });
    kit.add(o.assets.geo('box'), { x: 0, y: M.headY - 0.12, z: 0.16, sx: 0.34, sy: 0.1, sz: 0.1, color: 0xf0c020 });
  } else if (o.hat === 'straw') {
    kit.add(o.assets.geo('cylLow'), { y: M.headY + 0.16, sx: 0.5, sy: 0.08, sz: 0.5, color: 0xd8c25a });
    kit.add(o.assets.geo('cylLow'), { y: M.headY + 0.22, sx: 0.3, sy: 0.12, sz: 0.3, color: 0xc4ad46 });
  }
}

/**
 * Monta un civil.
 * @returns {{group: THREE.Group, body: THREE.Group, armL, armR, legL, legR, carry, height}}
 */
export function buildCitizen(assets, o = {}) {
  const look = UNIT_LOOK[o.role] || UNIT_LOOK.citizen;
  const group = new THREE.Group();
  group.name = `civ-unit-${o.role || 'citizen'}`;
  const body = new THREE.Group();
  group.add(body);

  const scale = o.scale || 1;
  group.scale.setScalar(scale);

  // --- Torso + cabeza (una sola malla) -----------------------------------
  const upper = new PartList();
  upper.add(assets.geo('torso'), { y: (M.hip + M.torsoTop) / 2, color: o.tunic || look.tunic });
  upper.add(assets.geo('box'), {
    x: 0, y: M.hip + 0.06, sx: 0.42, sy: 0.1, sz: 0.3, color: 0x2f3540,
  });                                                                   // cinturón
  upper.add(assets.geo('cylLow'), { y: M.torsoTop + 0.02, sx: 0.13, sy: 0.1, sz: 0.13, color: o.skin });
  upper.add(assets.geo('box'), { x: 0, y: M.shoulderY + 0.02, sx: 0.56, sy: 0.16, sz: 0.3, color: o.tunic || look.tunic });
  headParts(upper, { assets, skin: o.skin, hair: o.hair, hat: look.hat });
  const upperMesh = new THREE.Mesh(upper.merge(), assets.solidMaterial().clone());
  upperMesh.castShadow = false;
  body.add(upperMesh);

  let armL = null;
  let armR = null;
  let legL = null;
  let legR = null;
  let carry = null;

  if (o.lowres) {
    // Versión económica: miembros fusionados al torso, sin animación
    const all = new PartList();
    all.add(assets.geo('torso'), { y: (M.hip + M.torsoTop) / 2, color: o.tunic || look.tunic });
    for (const sx of [-1, 1]) {
      all.add(assets.geo('limb'), { x: sx * M.shoulderX, y: M.shoulderY - M.armLen / 2, color: o.tunic || look.tunic });
      all.add(assets.geo('legLimb'), { x: sx * 0.13, y: M.hip - M.legLen / 2, color: look.trousers });
      all.add(assets.geo('box'), { x: sx * 0.13, y: 0.05, sx: 0.17, sy: 0.1, sz: 0.26, color: BOOT });
    }
    headParts(all, { assets, skin: o.skin, hair: o.hair, hat: look.hat });
    const mesh = new THREE.Mesh(all.merge(), assets.solidMaterial().clone());
    body.add(mesh);
    upperMesh.geometry.dispose();
    upperMesh.removeFromParent();
  } else {
    const mkLimb = (side, geoKey, len, color, extra) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * M.shoulderX, M.shoulderY, 0);
      const list = new PartList();
      list.add(assets.geo(geoKey), { y: -len / 2, color });
      list.add(assets.geo('hand'), { y: -len + 0.02, color: o.skin });
      if (extra) extra(list);
      const mesh = new THREE.Mesh(list.merge(), assets.solidMaterial().clone());
      pivot.add(mesh);
      body.add(pivot);
      return pivot;
    };
    armL = mkLimb(-1, 'limb', M.armLen, o.tunic || look.tunic, (list) => {
      if (look.tool === 'rifle' || o.role === 'guard') {
        list.add(assets.geo('box'), { x: -0.2, y: -0.34, sx: 0.08, sy: 0.5, sz: 0.42, color: 0xffd166 });
      }
    });
    armR = mkLimb(1, 'limb', M.armLen, o.tunic || look.tunic, (list) => {
      tool(list, assets, look.tool);
    });
    const mkLeg = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.13, M.hip, 0);
      const list = new PartList();
      list.add(assets.geo('legLimb'), { y: -M.legLen / 2, color: look.trousers });
      list.add(assets.geo('box'), { y: -M.legLen + 0.05, sx: 0.18, sy: 0.11, sz: 0.28, color: BOOT });
      const mesh = new THREE.Mesh(list.merge(), assets.solidMaterial().clone());
      pivot.add(mesh);
      body.add(pivot);
      return pivot;
    };
    legL = mkLeg(-1);
    legR = mkLeg(1);

    // Carga a la espalda (se ve cuando vuelve con recursos)
    const carryList = new PartList();
    carryList.add(assets.geo('box'), { x: 0, y: 1.0, z: -0.22, sx: 0.3, sy: 0.3, sz: 0.2, color: o.carryColor || 0xd8b25a });
    carry = new THREE.Mesh(carryList.merge(), assets.solidMaterial().clone());
    carry.visible = false;
    body.add(carry);
  }

  return { group, body, armL, armR, legL, legR, carry, height: M.headY + M.headR };
}

/** Variación estable por unidad (para que no sean clones). */
export function citizenLook(uid, role) {
  const look = UNIT_LOOK[role] || UNIT_LOOK.citizen;
  const skin = SKIN_TONES[uid % SKIN_TONES.length];
  const hair = HAIR_TONES[(uid * 3 + 1) % HAIR_TONES.length];
  const tunic = look.tunic;
  const scale = 0.94 + ((uid * 37) % 11) / 100;
  return { skin, hair, tunic, scale };
}

/**
 * Anima el ciclo de andar. `speed01` va de 0 (parado) a 1 (velocidad máxima).
 */
export function animateCitizen(c, dt, time, speed01) {
  if (!c || !c.body) return;
  const s = Math.max(0, Math.min(1, speed01));
  const phase = time * (5.5 + s * 4.5);
  const swing = Math.sin(phase) * 0.62 * s;
  if (c.legL) c.legL.rotation.x = swing;
  if (c.legR) c.legR.rotation.x = -swing;
  if (c.armL) {
    c.armL.rotation.x = -swing * 0.8;
    c.armL.rotation.z = 0.1 + s * 0.05;
  }
  if (c.armR) {
    c.armR.rotation.x = swing * 0.8;
    c.armR.rotation.z = -0.1 - s * 0.05;
  }
  // Balanceo + respiración (siempre, incluso parado)
  c.body.position.y = Math.abs(Math.sin(phase)) * 0.05 * s + Math.sin(time * 1.7 + c.group.id) * 0.012;
  c.body.rotation.x = 0.07 * s;
  c.body.rotation.z = Math.sin(phase) * 0.03 * s;
  if (c.carry) {
    c.carry.position.y = 1.0 + Math.sin(time * 1.7 + c.group.id) * 0.01;
  }
}
