/**
 * Pruebas de la simulación de colonias (modo civilizar).
 * Se ejecutan con el runner nativo de Node: `npm test`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Colony, tileToLocal, localToTile, inGrid } from '../src/civ/Colony.js';
import { BUILDINGS, ERAS, GRID, BALANCE, UNIT_TYPES, PRIORITIES } from '../src/civ/CivConfig.js';

/** Hace avanzar la colonia `seconds` en pasos de `step`. */
function run(colony, seconds, step = 0.25, options = {}) {
  let t = 0;
  while (t < seconds) {
    colony.update(step, options);
    t += step;
  }
  return colony;
}

test('una colonia nueva empieza desde cero con centro, yacimientos y colonos', () => {
  const c = new Colony('earth');
  assert.equal(c.planetId, 'earth');
  assert.equal(c.era, 0);
  assert.equal(c.buildings.length, 1);
  assert.equal(c.buildings[0].type, 'center');
  assert.equal(c.buildings[0].progress, 1);
  assert.ok(c.nodes.length >= 5, 'debe haber yacimientos que explotar');
  assert.equal(c.population, BALANCE.startCitizens + BALANCE.startBuilders);
  assert.equal(c.popCap, 4, 'el centro da 4 de población');
  assert.ok(c.storage.food > 0 && c.storage.wood > 0);
  assert.equal(c.theme.demonym, 'Terrícolas');
});

test('cada planeta tiene su propio nombre de ciudadanos', () => {
  assert.equal(new Colony('mars').theme.demonym, 'Marcianos');
  assert.equal(new Colony('mercury').theme.demonym, 'Mercurianos');
  assert.equal(new Colony('neptune').theme.demonym, 'Neptunianos');
});

test('las casillas se convierten a coordenadas locales y vuelta (ida y retorno)', () => {
  for (let tx = 0; tx < GRID; tx++) {
    for (let tz = 0; tz < GRID; tz += 4) {
      const p = tileToLocal(tx, tz);
      const back = localToTile(p.x, p.z);
      assert.equal(back.tx, tx);
      assert.equal(back.tz, tz);
    }
  }
  assert.equal(inGrid(0, 0), true);
  assert.equal(inGrid(GRID, 0), false);
  assert.equal(inGrid(-1, 3), false);
});

test('construir descuenta recursos, ocupa la casilla y respeta los máximos', () => {
  const c = new Colony('earth');
  c.storage.wood = 500;
  c.storage.stone = 500;
  const before = c.storage.wood;
  const spot = c.findSpot('house');
  assert.ok(spot, 'debe encontrar un sitio libre');
  const r = c.build('house', spot.tx, spot.tz);
  assert.equal(r.ok, true);
  assert.equal(c.storage.wood, before - BUILDINGS.house.cost.wood);
  assert.equal(c.buildings.length, 2);
  assert.equal(c.buildingAt(spot.tx, spot.tz).type, 'house');
  // No se puede construir encima
  assert.equal(c.canBuild('house', spot.tx, spot.tz).ok, false);
  // Máximo de edificios
  const center = c.findBuilding('center');
  assert.equal(c.canBuild('center', center.tx + 1, center.tz).reason.includes('Máximo'), true);
});

test('no se construye sin materiales y el aviso indica lo que falta', () => {
  const c = new Colony('mars');
  c.storage.wood = 0;
  c.storage.stone = 0;
  const r = c.canBuild('house');
  assert.equal(r.ok, false);
  assert.ok(r.missing, 'debe decir qué material falta');
  assert.equal(c.build('house').ok, false);
});

test('los edificios de era superior están bloqueados hasta avanzar de era', () => {
  const c = new Colony('earth');
  c.storage.metal = 5000;
  c.storage.energy = 5000;
  c.storage.stone = 5000;
  c.storage.wood = 5000;
  c.storage.crystal = 5000;
  assert.equal(c.canBuild('lab').ok, false);
  c.era = 2;
  assert.equal(c.canBuild('lab').ok, true);
});

test('la construcción avanza con constructores y se termina', () => {
  const c = new Colony('earth');
  c.storage.wood = 500;
  c.storage.stone = 500;
  const spot = c.findSpot('house');
  c.build('house', spot.tx, spot.tz);
  const b = c.buildings[1];
  assert.equal(b.progress, 0);
  run(c, BUILDINGS.house.buildTime * 2.2, 0.25);
  assert.equal(b.progress, 1, 'la vivienda debe terminarse');
  assert.equal(c.popCap, 8, 'la vivienda suma población máxima');
});

test('cancelar una construcción devuelve la mitad de los materiales', () => {
  const c = new Colony('earth');
  c.storage.wood = 500;
  c.storage.stone = 500;
  const spot = c.findSpot('house');
  c.build('house', spot.tx, spot.tz);
  const woodAfterBuild = c.storage.wood;
  c.cancelBuild(c.buildings[1].uid);
  assert.equal(c.buildings.length, 1);
  assert.ok(Math.abs(c.storage.wood - (woodAfterBuild + BUILDINGS.house.cost.wood / 2)) < 1e-6);
});

test('la economía produce: granjas dan alimento y minerías dan metal', () => {
  const c = new Colony('earth');
  c.storage.wood = 2000;
  c.storage.stone = 2000;
  c.storage.metal = 2000;
  // Población suficiente para trabajar
  for (let i = 0; i < 8; i++) c.spawnUnit('citizen');
  c.buildings[0].progress = 1;
  const farm = c.build('farm');
  const mine = c.build('mine');
  assert.equal(farm.ok, true);
  assert.equal(mine.ok, true);
  farm.building.progress = 1;
  mine.building.progress = 1;
  c.assignWork();
  assert.ok(c.buildings.some(b => b.type === 'farm' && b.workers > 0), 'la granja debe tener granjeros');
  assert.ok(c.buildings.some(b => b.type === 'mine' && b.workers > 0), 'la minería debe tener mineros');

  const metal0 = c.storage.metal;
  c.storage.food = 5000; // para que el consumo no enmascare la producción
  run(c, 60, 0.5);
  assert.ok(c.stats.gathered.food > 0, 'las granjas deben aportar alimento');
  assert.ok(c.storage.metal > metal0, `la minería debe extraer metal (${metal0} -> ${c.storage.metal})`);
  assert.ok(c.stats.gathered.metal > 0);
  // El yacimiento se agota con la extracción
  const vein = c.nodes.find(n => n.uid === c.findBuilding('mine').node);
  assert.ok(vein && vein.amount < vein.maxAmount, 'el filón debe consumirse');
});

test('la población crece con comida y casas, y se alimenta de las reservas', () => {
  const c = new Colony('earth');
  c.storage.wood = 2000;
  c.storage.stone = 2000;
  c.storage.food = 5000;
  const house = c.build('house');
  house.building.progress = 1;
  const pop0 = c.population;
  run(c, BALANCE.growthTime * 2 + 2, 0.5);
  assert.ok(c.population > pop0, `debe nacer algún ciudadano (${pop0} -> ${c.population})`);
  assert.ok(c.population <= c.popCap, 'nunca por encima del límite de población');
});

test('sin alimento la colonia pasa hambre', () => {
  const c = new Colony('earth');
  c.storage.food = 0;
  for (let i = 0; i < 5; i++) c.spawnUnit('citizen');
  run(c, 40, 0.5);
  assert.ok(c.hunger > 0, 'el hambre debe acumularse');
});

test('los deslizadores de prioridad reparten a los ciudadanos', () => {
  const c = new Colony('earth');
  c.storage.wood = 3000;
  c.storage.stone = 3000;
  c.storage.metal = 3000;
  for (let i = 0; i < 10; i++) c.spawnUnit('citizen');
  c.build('farm').building.progress = 1;
  c.build('sawmill').building.progress = 1;
  c.priority.food = 10;
  c.priority.wood = 0;
  c.assignWork();
  const farmers = c.citizensByRole('farmer');
  const loggers = c.citizensByRole('logger');
  assert.ok(farmers > 0, 'con prioridad 10 en comida debe haber granjeros');
  assert.equal(loggers, 0, 'con prioridad 0 en madera no debe haber leñadores');
});

test('avanzar de era exige conocimiento y recursos', () => {
  const c = new Colony('earth');
  assert.equal(c.canAdvanceEra().ok, false);
  c.storage.knowledge = ERAS[1].knowledge;
  Object.keys(ERAS[1].cost).forEach(k => { c.storage[k] = ERAS[1].cost[k]; });
  assert.equal(c.canAdvanceEra().ok, true);
  const r = c.advanceEra();
  assert.equal(r.ok, true);
  assert.equal(c.era, 1);
  assert.equal(c.eraBonus, ERAS[1].bonus);
});

test('una incursión sin defensa daña edificios y con defensa se repela', () => {
  // Sin defensa: recibe daño
  const weak = new Colony('mars');
  weak.storage.wood = 3000;
  weak.storage.stone = 3000;
  const h = weak.build('house');
  h.building.progress = 1;
  weak.priority.defense = 0;
  weak.assignWork();
  weak.raid.timer = 1;
  run(weak, 30, 0.5);
  assert.equal(weak.raid.active, false, 'la incursión termina');
  assert.ok(weak.stats.raids >= 1);
  const damaged = weak.buildings.some(b => b.hp < 100);
  assert.ok(damaged || weak.stats.buildingsLost > 0, 'sin defensa debería haber daños o edificios destruidos');

  // Con torretas: se repela sin daños
  const strong = new Colony('mars');
  strong.storage.metal = 5000;
  strong.storage.energy = 5000;
  strong.storage.wood = 5000;
  strong.storage.stone = 5000;
  strong.era = 1;
  for (let i = 0; i < 4; i++) strong.build('turret').building.progress = 1;
  strong.assignWork();
  const defense = strong.defense;
  strong.raid.timer = 1;
  run(strong, 30, 0.5);
  assert.ok(defense > 0);
  assert.equal(strong.stats.raidsRepelled, 1, 'debe repeler la incursión');
  assert.ok(strong.buildings.every(b => b.hp === 100), 'ningún edificio dañado');
});

test('el puerto espacial permite exportar a la órbita', () => {
  const c = new Colony('saturn');
  c.storage.metal = 400;
  assert.equal(c.exportToOrbit().ok, false, 'sin puerto espacial no se puede');
  c.era = 2;
  c.storage.metal = 5000;
  c.storage.energy = 5000;
  c.storage.crystal = 5000;
  c.storage.wood = 5000;
  c.storage.stone = 5000;
  const port = c.build('spaceport');
  assert.equal(port.ok, true);
  port.building.progress = 1;
  const metalBefore = c.storage.metal;
  const r = c.exportToOrbit();
  assert.equal(r.ok, true);
  assert.ok(r.materials.metal > 0);
  assert.equal(c.storage.metal, metalBefore - r.materials.metal);
  assert.equal(c.hasSpaceport(), true);
});

test('la partida de una colonia sobrevive a un guardado/cargado', () => {
  const c = new Colony('venus');
  c.storage.wood = 1500;
  c.storage.stone = 900;
  c.storage.metal = 300;
  c.storage.knowledge = 80;
  c.build('house').building.progress = 1;
  c.build('farm').building.progress = 1;
  c.build('sawmill').building.progress = 1;
  c.priority.mineral = 9;
  run(c, 30, 0.5);
  c.assignWork();

  const json = JSON.parse(JSON.stringify(c.toJSON()));   // como en un archivo .json
  const back = Colony.fromJSON(json);

  assert.equal(back.planetId, c.planetId);
  assert.equal(back.era, c.era);
  assert.equal(back.buildings.length, c.buildings.length);
  assert.equal(back.population, c.population);
  assert.equal(back.priority.mineral, 9);
  for (const key of Object.keys(c.storage)) {
    assert.ok(Math.abs(back.storage[key] - c.storage[key]) < 0.6, `almacén de ${key} conservado`);
  }
  // Los papeles de los peones se conservan
  const roles = (x) => x.units.map(u => u.role).sort().join(',');
  assert.equal(roles(back), roles(c));
  // Y la colonia sigue funcionando después de cargarla
  const food0 = back.storage.food;
  back.storage.food = 5000;
  run(back, 30, 0.5);
  assert.ok(back.age > c.age, 'el tiempo sigue corriendo');
  assert.ok(Number.isFinite(back.storage.food) && back.storage.food !== food0);
});

test('un guardado corrupto o parcial no rompe la colonia', () => {
  const partial = Colony.fromJSON({ planetId: 'mars', buildings: [{ type: 'farm', tx: 3, tz: 3, progress: 1 }], units: [] });
  assert.ok(partial);
  assert.ok(partial.findBuilding('center'), 'si falta el centro se reconstruye');
  assert.equal(partial.buildings.filter(b => b.type === 'farm').length, 1);
  run(partial, 5, 0.5);
  assert.equal(Colony.fromJSON(null), null);
  assert.equal(Colony.fromJSON({}), null);
});

test('los eventos se acumulan y se pueden vaciar', () => {
  const c = new Colony('earth');
  c.storage.wood = 500;
  c.storage.stone = 500;
  c.build('house');
  assert.ok(c.events.length >= 1);
  const drained = c.drainEvents();
  assert.ok(drained.length >= 1);
  assert.equal(c.drainEvents().length, 0);
});

test('todas las unidades tienen nombre, velocidad y color', () => {
  for (const role of ['builder', 'farmer', 'logger', 'miner', 'scholar', 'guard', 'citizen']) {
    const def = UNIT_TYPES[role];
    assert.ok(def, `falta el papel ${role}`);
    assert.ok(def.speed > 0);
    assert.ok(typeof def.color === 'number');
  }
  for (const key of Object.keys(PRIORITIES)) {
    assert.ok(PRIORITIES[key].default >= 0 && PRIORITIES[key].default <= 10);
  }
});
