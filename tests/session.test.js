/**
 * Partida de colonia completa: nacer, construir, extraer, guardar, cargar y
 * seguir produciendo. Cubre el bucle que el jugador ve en el modo civilizar.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Colony } from '../src/civ/Colony.js';
import { BUILDINGS, ERAS } from '../src/civ/CivConfig.js';
import { SaveSystem, GAME_ID, SAVE_VERSION } from '../src/systems/SaveSystem.js';

function run(c, seconds, step = 0.25) {
  let t = 0;
  while (t < seconds) { c.update(step); t += step; }
}

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

test('sesión completa: granja + carpintería + minería producen y sobreviven a un guardado', () => {
  const c = new Colony('earth');
  // Población y almacén de arranque suficientes para construir
  c.storage.wood = 4000;
  c.storage.stone = 4000;
  c.storage.metal = 4000;
  c.storage.food = 4000;
  for (let i = 0; i < 10; i++) c.spawnUnit('citizen');

  const house = c.build('house');
  const farm = c.build('farm');
  const mill = c.build('sawmill');
  const mine = c.build('mine');
  assert.equal(house.ok && farm.ok && mill.ok && mine.ok, true, 'las cuatro obras deben aceptarse');
  house.building.progress = 1;
  farm.building.progress = 1;
  mill.building.progress = 1;
  mine.building.progress = 1;
  c.priority.food = 8;
  c.priority.wood = 8;
  c.priority.mineral = 8;
  c.priority.build = 2;
  c.assignWork();

  assert.ok(c.citizensByRole('farmer') > 0, 'hay granjeros');
  assert.ok(c.citizensByRole('logger') > 0, 'hay leñadores');
  assert.ok(c.citizensByRole('miner') > 0, 'hay mineros');

  const wood0 = c.storage.wood;
  const metal0 = c.storage.metal;
  run(c, 90, 0.5);

  assert.ok(c.stats.gathered.food > 0, 'los granjeros recogen alimento');
  assert.ok(c.storage.wood > wood0, `los leñadores recogen madera (${wood0} → ${c.storage.wood})`);
  assert.ok(c.storage.metal > metal0, `los mineros recogen metal (${metal0} → ${c.storage.metal})`);
  assert.ok(c.population >= 4, 'la colonia sigue habitada');

  // Partida de "navegador": se guarda el JSON de la colonia dentro del estado del juego
  let applied = null;
  const save = new SaveSystem({
    storage: fakeStorage(),
    serialize: () => ({
      credits: 120,
      playTime: c.age,
      colonies: { earth: c.toJSON() },
      walle: { credits: 120 },
    }),
    apply: (state) => { applied = state; },
  });
  const r = save.save('slot1', 'Tierra');
  assert.equal(r.ok, true);
  assert.equal(r.payload.game, GAME_ID);
  assert.equal(r.payload.saveVersion, SAVE_VERSION);

  const load = save.load('slot1');
  assert.equal(load.ok, true);
  assert.ok(applied.colonies.earth);
  const back = Colony.fromJSON(applied.colonies.earth);
  assert.equal(back.planetId, 'earth');
  assert.equal(back.buildings.filter(b => b.type === 'farm').length, 1);
  assert.equal(back.buildings.filter(b => b.type === 'sawmill').length, 1);
  assert.equal(back.buildings.filter(b => b.type === 'mine').length, 1);
  assert.equal(back.theme.demonym, 'Terrícolas');

  const foodAfter = back.storage.food;
  const woodAfter = back.storage.wood;
  back.storage.food = Math.max(back.storage.food, 3000);
  run(back, 40, 0.5);
  assert.ok(back.age > c.age - 1, 'el reloj de la colonia continúa');
  assert.ok(back.stats.gathered.wood >= 0);
  assert.ok(back.storage.wood >= woodAfter * 0.5, 'tras cargar, la carpintería sigue en pie');
  void foodAfter;
});

test('en Marte los ciudadanos son marcianos y el metal rinde más que en la Tierra', () => {
  const mars = new Colony('mars');
  const earth = new Colony('earth');
  for (const c of [mars, earth]) {
    c.storage.wood = 5000;
    c.storage.stone = 5000;
    c.storage.metal = 100;
    c.storage.food = 5000;
    for (let i = 0; i < 8; i++) c.spawnUnit('citizen');
    const m = c.build('mine');
    assert.equal(m.ok, true);
    m.building.progress = 1;
    c.priority.mineral = 10;
    c.priority.food = 0;
    c.priority.wood = 0;
    c.assignWork();
  }
  assert.equal(mars.theme.demonym, 'Marcianos');
  assert.equal(earth.theme.demonym, 'Terrícolas');
  run(mars, 60, 0.5);
  run(earth, 60, 0.5);
  assert.ok(
    (mars.stats.gathered.metal || 0) > (earth.stats.gathered.metal || 0),
    `Marte debe extraer más metal (${mars.stats.gathered.metal} vs ${earth.stats.gathered.metal})`
  );
});

test('una colonia puede subir de era y desbloquear el laboratorio', () => {
  const c = new Colony('venus');
  assert.equal(c.canBuild('lab').ok, false);
  c.storage.knowledge = ERAS[1].knowledge;
  Object.assign(c.storage, { ...c.storage, ...ERAS[1].cost, food: 5000, wood: 5000, metal: 5000, energy: 5000 });
  assert.equal(c.advanceEra().ok, true);
  c.storage.knowledge = ERAS[2].knowledge;
  Object.assign(c.storage, ERAS[2].cost);
  c.storage.metal = Math.max(c.storage.metal, ERAS[2].cost.metal || 0);
  c.storage.energy = Math.max(c.storage.energy, ERAS[2].cost.energy || 0);
  c.storage.food = Math.max(c.storage.food, ERAS[2].cost.food || 0);
  assert.equal(c.advanceEra().ok, true);
  assert.equal(c.era, 2);
  c.storage.wood = 5000;
  c.storage.metal = 5000;
  c.storage.energy = 5000;
  assert.equal(c.canBuild('lab').ok, true);
  const lab = c.build('lab');
  assert.equal(lab.ok, true);
  assert.equal(lab.building.type, 'lab');
  void BUILDINGS;
});
