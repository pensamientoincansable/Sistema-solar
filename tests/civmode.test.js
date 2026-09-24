/**
 * Integración del modo civilizar con three.js: se monta la superficie de un
 * planeta, se construye, se sincronizan las mallas y se sale. Sin navegador
 * (jsdom aporta window/document y three.js funciona sin WebGL para la escena).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './helpers/dom.js';

// --- Entorno mínimo de navegador antes de tocar los módulos que usan window ---
installDom();

const THREE = await import('three');
const { CivMode, heightAt } = await import('../src/civ/CivMode.js');
const { BUILDINGS, GRID } = await import('../src/civ/CivConfig.js');

function makePlanet(id = 'earth', radius = 5) {
  const group = new THREE.Group();
  return { config: { id, radius, name: 'Planeta', emoji: '🪐' }, group, worldPosition: new THREE.Vector3(60, 0, 0) };
}

function makeCiv(planetId = 'earth') {
  const scene = new THREE.Scene();
  const canvas = document.createElement('canvas');
  const renderer = { domElement: canvas };
  const civ = new CivMode(scene, renderer, { landingNormal: new THREE.Vector3(1, 0, 0) });
  const planet = makePlanet(planetId);
  scene.add(planet.group);
  return { civ, scene, planet };
}

function fakeInput(over = {}) {
  return {
    moveX: 0, moveY: 0, up: false, down: false, lookX: 0, lookY: 0,
    boost: false, shooting: false, actionHeld: false, civilizeHeld: false, ...over,
  };
}

test('entrar a un planeta monta terreno, luces, colonia y cámara', () => {
  const { civ, planet } = makeCiv('earth');
  const ok = civ.enter(planet);
  assert.equal(ok, true);
  assert.equal(civ.active, true);
  assert.equal(civ.planet, planet);
  assert.ok(civ.root, 'debe existir el grupo de la colonia');
  assert.equal(civ.root.parent, planet.group, 'la colonia cuelga del planeta');
  assert.ok(civ.terrain && civ.terrain.isMesh, 'debe haber terreno');
  assert.ok(civ.root.children.length >= 3, 'terreno + luces + rejilla + marcador');
  assert.ok(civ.colony.buildings.length >= 1);
  // La cámara se coloca fuera del suelo y mira al asentamiento
  assert.ok(civ.camera.position.length() > 1, 'la cámara debe tener posición');
  assert.ok(Number.isFinite(civ.camera.position.x));
  // La normal de aterrizaje orienta el grupo: +Y local apunta hacia fuera
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(civ.root.quaternion);
  assert.ok(up.x > 0.99, 'el suelo debe quedar perpendicular al radio del planeta');
  civ.exit();
});

test('la altura del terreno es llana en el centro y crece hacia fuera', () => {
  assert.equal(heightAt(0, 0), 0);
  assert.ok(Math.abs(heightAt(2, -3)) < 0.001, 'dentro de la ciudad el suelo es plano');
  let maxH = 0;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    maxH = Math.max(maxH, Math.abs(heightAt(Math.cos(a) * 60, Math.sin(a) * 60)));
  }
  assert.ok(maxH > 0.5, `fuera de la ciudad hay relieve (máx ${maxH.toFixed(2)})`);
});

test('construir crea el edificio en la colonia y su malla en la escena', () => {
  const { civ, planet } = makeCiv('mars');
  civ.enter(planet);
  const colony = civ.colony;
  colony.storage.wood = 1000;
  colony.storage.stone = 1000;

  const spot = civ.setPendingBuild('house');
  assert.ok(spot, 'debe proponer una casilla');
  assert.equal(civ.pendingType, 'house');
  const r = civ.confirmBuild();
  assert.equal(r.ok, true, `debe construirse: ${r.reason || ''}`);
  assert.equal(colony.buildings.length, 2);
  assert.equal(civ.pendingType, null, 'la selección se limpia al construir');

  civ.update(0.1, fakeInput());
  assert.equal(civ.bMeshes.size, 2, 'cada edificio tiene su malla');
  const mesh = civ.bMeshes.get(r.building.uid);
  assert.ok(mesh && mesh.group.parent === civ.root, 'la malla está en la colonia');
  assert.ok(mesh.group.scale.x < 1, 'una obra en curso se dibuja encogida');

  // Al terminarse recupera el tamaño completo
  r.building.progress = 1;
  civ.update(0.1, fakeInput());
  assert.equal(civ.bMeshes.get(r.building.uid).group.scale.x, 1);
  civ.exit();
});

test('los peones y los yacimientos tienen malla y siguen a la simulación', () => {
  const { civ, planet } = makeCiv('earth');
  civ.enter(planet);
  civ.update(0.1, fakeInput());
  assert.equal(civ.uMeshes.size, civ.colony.units.length);
  assert.equal(civ.nMeshes.size, civ.colony.nodes.length);
  const unit = civ.colony.units[0];
  const before = { x: unit.x, z: unit.z };
  // El bucle real (Game._updateCiv) dibuja y además hace avanzar la simulación
  for (let i = 0; i < 40; i++) { civ.update(0.1, fakeInput()); civ.updateColonies(0.1); }   // 4 s
  const mesh = civ.uMeshes.get(unit.uid);
  assert.ok(mesh, 'el peón conserva su malla');
  const moved = Math.hypot(unit.x - before.x, unit.z - before.z) > 0.01;
  assert.ok(moved || unit.wait > 0, 'los peones se mueven o esperan');
  assert.equal(civ.uMeshes.size, civ.colony.units.length);
  civ.exit();
});

test('salir limpia la escena y deja de actualizar', () => {
  const { civ, planet } = makeCiv('venus');
  civ.enter(planet);
  civ.colony.storage.wood = 500;
  civ.colony.storage.stone = 500;
  civ.setPendingBuild('house');
  civ.confirmBuild();
  civ.update(0.1, fakeInput());
  assert.ok(civ.root.children.length > 0);

  const root = civ.root;
  assert.equal(civ.exit(), true);
  assert.equal(civ.active, false);
  assert.equal(civ.root, null);
  assert.equal(civ.bMeshes.size, 0);
  assert.equal(civ.uMeshes.size, 0);
  assert.equal(planet.group.children.includes(root), false, 'la colonia se descuelga del planeta');
  assert.equal(civ.exit(), false, 'salir dos veces no rompe nada');
  civ.update(0.1, fakeInput());   // sin colonia activa no debe lanzar
});

test('entrar dos veces seguidas no duplica la colonia', () => {
  const { civ, planet } = makeCiv('earth');
  civ.enter(planet);
  assert.equal(civ.enter(planet), false, 'ya está dentro');
  civ.exit();
  civ.enter(planet);
  assert.equal(civ.colonies.size, 1, 'se reutiliza la misma colonia');
  civ.exit();
});

test('el teclado mueve la vista y la rueda hace zoom', () => {
  const { civ, planet } = makeCiv('earth');
  civ.enter(planet);
  const dist0 = civ.view.dist;
  const fz0 = civ.view.fz;
  civ.view.yaw = 0;
  civ.update(0.5, fakeInput({ moveY: 1 }));
  assert.notEqual(civ.view.fz, fz0, 'el foco se desplaza con W/S');
  civ.view.dist = dist0;
  civ.update(0.5, fakeInput({ up: true }));
  assert.ok(civ.view.dist < dist0, 'Q acerca la cámara');
  assert.ok(civ.view.dist >= 18 && civ.view.dist <= 150, 'el zoom queda dentro de los límites');
  civ.exit();
});

test('las colonias siguen produciendo mientras se vuela por el espacio', () => {
  const { civ, planet } = makeCiv('jupiter');
  civ.enter(planet);
  const colony = civ.colony;
  colony.storage.wood = 2000;
  colony.storage.stone = 2000;
  colony.storage.metal = 2000;
  for (let i = 0; i < 6; i++) colony.spawnUnit('citizen');
  colony.build('farm').building.progress = 1;
  colony.assignWork();
  civ.exit();

  const food0 = colony.storage.food;
  colony.storage.food = 4000;
  for (let i = 0; i < 120; i++) civ.updateColonies(0.5);   // 60 s "en órbita"
  assert.ok(colony.age >= 59.9, `la colonia envejece sin estar visitándola (${colony.age})`);
  assert.ok(colony.stats.gathered.food > 0, `las granjas producen (food0=${food0})`);
});

test('los sucesos de la colonia se pueden recoger para el registro', () => {
  const { civ, planet } = makeCiv('earth');
  civ.enter(planet);
  civ.colony.storage.wood = 500;
  civ.colony.storage.stone = 500;
  civ.setPendingBuild('house');
  civ.confirmBuild();
  const events = civ.drainEvents();
  assert.ok(events.length >= 1);
  assert.equal(events[0].planetId, 'earth');
  assert.equal(civ.drainEvents().length, 0, 'se vacían al leerlos');
  civ.exit();
});

test('serializar y recargar colonias mantiene las que había', () => {
  const { civ, planet } = makeCiv('saturn');
  civ.enter(planet);
  civ.colony.storage.metal = 900;
  civ.exit();
  const data = JSON.parse(JSON.stringify(civ.serializeColonies()));
  assert.ok(data.saturn, 'saturn está en el guardado');

  const fresh = makeCiv('earth');
  const n = fresh.civ.loadColonies(data);
  assert.equal(n, 1);
  assert.equal(fresh.civ.hasColony('saturn'), true);
  assert.ok(Math.abs(fresh.civ.getColony('saturn').storage.metal - 900) < 1);
  assert.equal(fresh.civ.hasColony('mars'), false);
  fresh.civ.loadColonies({ mars: { planetId: 'mars' } });
  assert.ok(fresh.civ.getColony('mars'), 'un guardado mínimo crea la colonia');
  fresh.civ.reset();
  assert.equal(fresh.civ.colonies.size, 0);
});

test('la rejilla cubre el asentamiento completo', () => {
  const { civ, planet } = makeCiv('earth');
  civ.enter(planet);
  civ.selectTile(0, 0);
  assert.deepEqual(civ.selectedTile, { tx: 0, tz: 0 });
  assert.equal(civ.selectTile(GRID + 3, 0), false, 'fuera de la rejilla no se selecciona');
  civ.selectTile((GRID - 1) / 2, (GRID - 1) / 2);
  assert.equal(civ.marker.visible, true);
  civ.exit();
});

test('todos los tipos de edificio generan una malla sin errores', () => {
  const { civ, planet } = makeCiv('earth');
  civ.enter(planet);
  const colony = civ.colony;
  colony.era = 3;
  Object.keys(BUILDINGS).forEach((type) => {
    Object.keys(colony.storage).forEach(k => { colony.storage[k] = 99999; });
    const r = civ.colony.build(type);
    if (!r.ok) return;   // máximos alcanzados
    r.building.progress = 1;
    civ.update(0.05, fakeInput());
    const mesh = civ.bMeshes.get(r.building.uid);
    assert.ok(mesh, `falta la malla de ${type}`);
    let meshes = 0;
    mesh.group.traverse(o => { if (o.isMesh) meshes++; });
    assert.ok(meshes >= 1, `${type} debe tener geometría`);
  });
  civ.exit();
});
