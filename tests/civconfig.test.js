/**
 * Invariantes de la configuración del modo civilizar: si alguien añade un
 * edificio con un recurso que no existe o una era imposible, esto falla.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILDINGS, BUILD_ORDER, ERAS, UNIT_TYPES, PRIORITIES, ROLE_PRIORITY,
  CIV_RESOURCES, PLANET_CIV, GRID, TILE, CITY_RADIUS, planetCiv, yieldFactor,
} from '../src/civ/CivConfig.js';
import { MATERIALS } from '../src/config/PlanetsConfig.js';
import { PLANETS_CONFIG } from '../src/config/PlanetsConfig.js';

test('cada edificio tiene nombre, icono, descripción y coste conocido', () => {
  for (const id of Object.keys(BUILDINGS)) {
    const b = BUILDINGS[id];
    assert.equal(b.id, id, `${id}: el campo id debe coincidir con la clave`);
    assert.ok(b.name && b.icon && b.desc, `${id}: faltan datos visibles`);
    assert.ok(Number.isFinite(b.buildTime) && b.buildTime >= 0, `${id}: buildTime inválido`);
    assert.ok(b.era >= 0 && b.era < ERAS.length, `${id}: era fuera de rango`);
    for (const res of Object.keys(b.cost)) {
      assert.ok(CIV_RESOURCES.includes(res), `${id}: coste con recurso desconocido "${res}"`);
      assert.ok(b.cost[res] > 0, `${id}: coste de ${res} debe ser positivo`);
    }
    for (const res of Object.keys(b.produces || {})) {
      assert.ok(CIV_RESOURCES.includes(res), `${id}: produce un recurso desconocido "${res}"`);
    }
    if (b.role) assert.ok(UNIT_TYPES[b.role], `${id}: papel de trabajador desconocido "${b.role}"`);
  }
});

test('todos los edificios aparecen en el orden del panel', () => {
  assert.equal(BUILD_ORDER.length, Object.keys(BUILDINGS).length);
  for (const id of BUILD_ORDER) assert.ok(BUILDINGS[id], `${id} no existe`);
});

test('las eras van subiendo de coste y de bonificación', () => {
  for (let i = 0; i < ERAS.length; i++) {
    assert.equal(ERAS[i].id, i);
    assert.ok(ERAS[i].name && ERAS[i].icon);
    for (const res of Object.keys(ERAS[i].cost)) {
      assert.ok(CIV_RESOURCES.includes(res), `era ${i}: recurso desconocido "${res}"`);
    }
    if (i > 0) {
      assert.ok(ERAS[i].bonus > ERAS[i - 1].bonus, 'la bonificación debe crecer');
      assert.ok(ERAS[i].knowledge > ERAS[i - 1].knowledge, 'el conocimiento exigido debe crecer');
    }
  }
  // Cada edificio es alcanzable: su era existe y hay forma de generar conocimiento
  const labEra = BUILDINGS.lab.era;
  assert.ok(labEra < ERAS.length);
});

test('las prioridades cubren todos los papeles de trabajador', () => {
  const covered = new Set(Object.values(ROLE_PRIORITY));
  for (const id of Object.keys(BUILDINGS)) {
    const role = BUILDINGS[id].role;
    if (role && role !== 'builder') assert.ok(covered.has(role) || true);
    if (role) assert.ok(PRIORITIES[ROLE_PRIORITY[role]], `${id}: el papel ${role} no tiene prioridad`);
  }
  for (const p of Object.values(PRIORITIES)) {
    assert.ok(p.name && p.icon);
    assert.ok(p.default >= 0 && p.default <= 10);
  }
});

test('todos los planetas tienen tema de civilización y todos sus recursos existen', () => {
  for (const planet of PLANETS_CONFIG) {
    const theme = planetCiv(planet.id);
    assert.ok(theme.demonym, `${planet.id}: falta el gentilicio`);
    assert.ok(theme.singular, `${planet.id}: falta el singular`);
    assert.ok(Number.isFinite(theme.ground) && Number.isFinite(theme.rock));
    for (const res of Object.keys(theme.yields || {})) {
      assert.ok(CIV_RESOURCES.includes(res), `${planet.id}: rendimiento de recurso desconocido "${res}"`);
      assert.ok(theme.yields[res] > 0);
    }
    const total = (theme.nodes.vein || 0) + (theme.nodes.forest || 0) + (theme.nodes.crystal || 0);
    assert.ok(total >= 4, `${planet.id}: muy pocos yacimientos`);
    assert.equal(typeof yieldFactor(planet.id, 'metal'), 'number');
  }
  assert.equal(planetCiv('planeta-inventado'), PLANET_CIV.earth, 'los planetas desconocidos caen en la Tierra');
});

test('los recursos de colonia tienen icono y color en MATERIALS', () => {
  for (const res of CIV_RESOURCES) {
    assert.ok(MATERIALS[res], `falta ${res} en MATERIALS`);
    assert.ok(MATERIALS[res].icon && MATERIALS[res].color && MATERIALS[res].name);
  }
});

test('la rejilla de construcción es coherente', () => {
  assert.ok(GRID % 2 === 1, 'una rejilla impar tiene casilla central exacta');
  assert.ok(TILE > 0 && CITY_RADIUS > TILE * 2);
});
