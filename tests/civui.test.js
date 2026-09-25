/**
 * Panel del modo civilizar: se monta en el DOM, refleja la colonia y
 * dispara las acciones (avanzar era, exportar, salir).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './helpers/dom.js';

installDom();

const THREE = await import('three');
const { CivMode } = await import('../src/civ/CivMode.js');
const { CivUI } = await import('../src/ui/CivUI.js');
const { BUILD_ORDER, BUILDINGS, CIV_BAR, ERAS } = await import('../src/civ/CivConfig.js');

function make() {
  document.getElementById('civ-ui')?.remove();
  const scene = new THREE.Scene();
  const canvas = document.createElement('canvas');
  const civ = new CivMode(scene, { domElement: canvas }, { landingNormal: new THREE.Vector3(0, 1, 0) });
  const planet = {
    config: { id: 'mars', radius: 3.5, name: 'Marte', emoji: '♂️' },
    group: new THREE.Group(),
    worldPosition: new THREE.Vector3(80, 0, 0),
  };
  scene.add(planet.group);
  civ.enter(planet);
  const hooks = { exited: false, exported: null, notes: [] };
  const ui = new CivUI(civ, {
    onExit: () => { hooks.exited = true; },
    onExport: (r) => { hooks.exported = r; },
    onNotify: (msg, type) => { hooks.notes.push({ msg, type }); },
  });
  return { civ, ui, hooks, planet };
}

test('el panel se crea con la lista de edificios y los deslizadores de prioridad', () => {
  const { ui } = make();
  assert.ok(document.getElementById('civ-ui'), 'el panel existe en el DOM');
  const items = document.querySelectorAll('.civ-item');
  assert.equal(items.length, BUILD_ORDER.length, 'un botón por edificio');
  for (const id of BUILD_ORDER) {
    assert.ok(document.querySelector(`.civ-item[data-type="${id}"]`), `falta ${id}`);
  }
  const sliders = document.querySelectorAll('.civ-slider input');
  assert.equal(sliders.length, 6, 'comida, madera, mineral, construcción, defensa, investigación');
  ui.show();
  assert.ok(ui.root.classList.contains('visible'));
  ui.hide();
  assert.equal(ui.root.classList.contains('visible'), false);
});

test('al mostrarse refleja nombre, era, población y recursos de la colonia', () => {
  const { civ, ui } = make();
  ui.show();
  ui.refresh(1, true);
  assert.equal(ui.els.name.textContent, civ.colony.name);
  assert.ok(ui.els.emoji.textContent.includes('♂️') || ui.els.emoji.textContent.length > 0);
  assert.equal(ui.els.eraName.textContent, ERAS[0].name);
  assert.match(ui.els.pop.textContent, /^\d+\/\d+$/);
  const resHtml = ui.els.res.innerHTML;
  for (const id of CIV_BAR) {
    assert.ok(resHtml.length > 0, 'la barra de recursos no está vacía');
    void id;
  }
  assert.ok(ui.els.res.querySelectorAll('.civ-res-item').length === CIV_BAR.length);
});

test('elegir un edificio lo deja pendiente y volver a pulsarlo lo cancela', () => {
  const { civ, ui } = make();
  civ.colony.storage.wood = 500;
  civ.colony.storage.stone = 500;
  ui.show();
  const house = document.querySelector('.civ-item[data-type="house"]');
  house.click();
  assert.equal(civ.pendingType, 'house');
  ui.refresh(0, true);
  assert.ok(house.classList.contains('selected'));
  house.click();
  assert.equal(civ.pendingType, null);
});

test('el botón de salir llama al gancho onExit', () => {
  const { ui, hooks } = make();
  ui.show();
  document.querySelector('.civ-btn[data-act="exit"]').click();
  assert.equal(hooks.exited, true);
});

test('avanzar de era sin recursos avisa; con recursos sube de era', () => {
  const { civ, ui, hooks } = make();
  ui.show();
  // El botón está deshabilitado sin recursos: se prueba la acción directa
  ui._action('era');
  assert.equal(civ.colony.era, 0);
  assert.ok(hooks.notes.length >= 1);
  assert.equal(hooks.notes.at(-1).type, 'danger');

  civ.colony.storage.knowledge = 9999;
  civ.colony.storage.food = 9999;
  civ.colony.storage.wood = 9999;
  civ.colony.storage.metal = 9999;
  civ.colony.storage.energy = 9999;
  civ.colony.storage.crystal = 9999;
  ui._action('era');
  assert.equal(civ.colony.era, 1);
  assert.equal(hooks.notes.at(-1).type, 'success');
});

test('exportar sin puerto espacial falla; con puerto envía materiales', () => {
  const { civ, ui, hooks } = make();
  ui.show();
  ui._action('export');
  assert.equal(hooks.exported && hooks.exported.ok, false);

  civ.colony.era = 2;
  Object.keys(civ.colony.storage).forEach(k => { civ.colony.storage[k] = 5000; });
  const port = civ.colony.build('spaceport');
  assert.equal(port.ok, true);
  port.building.progress = 1;
  ui._action('export');
  assert.equal(hooks.exported && hooks.exported.ok, true);
  assert.ok(hooks.exported.value > 0);
});

test('el registro muestra los últimos sucesos y se puede vaciar', () => {
  const { ui } = make();
  ui.show();
  ui.log('hola colonia', 'success');
  ui.log('incursión', 'danger');
  assert.match(ui.els.log.innerHTML, /hola colonia/);
  assert.match(ui.els.log.innerHTML, /incursión/);
  ui.clearLog();
  assert.equal(ui.els.log.innerHTML, '');
});

test('los edificios de era superior aparecen bloqueados al inicio', () => {
  const { ui } = make();
  ui.show();
  ui.refresh(0, true);
  const lab = document.querySelector('.civ-item[data-type="lab"]');
  assert.ok(lab.classList.contains('locked'), 'el laboratorio es de era 2');
  assert.ok(BUILDINGS.lab.era > 0);
});

test('la barra de órdenes manda a los civiles seleccionados a recolectar', () => {
  const { civ, ui } = make();
  ui.show();
  civ.colony.storage.food = 100;
  // Sin selección no se puede dar la orden
  ui._order('wood');
  assert.equal(civ.colony.manualUnits().length, 0);

  civ.selectAllUnits();
  ui.refresh(0, true);
  assert.equal(ui.els.selCount.textContent.includes('seleccionados'), true, 'la barra cuenta la selección');

  const orders = document.querySelectorAll('.civ-order');
  assert.equal(orders.length, 6, 'un botón por recurso recolectable');
  const wood = document.querySelector('.civ-order[data-res="wood"]');
  wood.click();
  assert.equal(civ.colony.manualUnits().length, civ.colony.units.length, 'todos pasan a recolectar madera');
  assert.equal(civ.colony.units.every(u => u.role === 'logger'), true);
  assert.ok(wood.classList.contains('active'), 'la orden activa se marca');

  // Volver al reparto automático
  document.querySelector('.civ-btn[data-act="release"]').click();
  assert.equal(civ.colony.manualUnits().length, 0);
  assert.equal(wood.classList.contains('active'), false);
});

test('un recurso sin dónde explotarlo aparece bloqueado en la barra', () => {
  const { civ, ui } = make();
  ui.show();
  civ.colony.buildings = civ.colony.buildings.filter(b => b.type !== 'farm');
  ui.refresh(0, true);
  const food = document.querySelector('.civ-order[data-res="food"]');
  assert.equal(food.disabled, true, 'sin granja no se puede mandar a por alimento');
  assert.match(food.title, /granja/);
});

test('el ayuntamiento entrena civiles y el límite lo suben las viviendas', () => {
  const { civ, ui } = make();
  ui.show();
  const center = civ.colony.findBuilding('center');
  civ.selectBuilding(center.uid);
  ui.refresh(0, true);
  assert.ok(document.getElementById('civ-town').classList.contains('on'), 'se abre el panel del ayuntamiento');

  // Sin alimento no se puede
  civ.colony.storage.food = 0;
  ui.refresh(0, true);
  assert.equal(document.querySelector('[data-act="train"]').disabled, true);

  // Con alimento entrena y el civil nace al terminar la espera
  civ.colony.storage.food = 200;
  civ.colony.storage.wood = 500;
  civ.colony.storage.stone = 500;
  civ.colony.build('house').building.progress = 1;   // +4 de población
  const pop0 = civ.colony.population;
  ui.refresh(0, true);
  const train = document.querySelector('[data-act="train"]');
  assert.equal(train.disabled, false, 'con comida y sitio se puede entrenar');
  train.click();
  assert.ok(civ.colony.trainTimer > 0, 'queda un civil en camino');
  for (let i = 0; i < 20 && civ.colony.population === pop0; i++) civ.updateColonies(0.5);
  assert.equal(civ.colony.population, pop0 + 1, 'nace el civil nuevo');

  // Al llegar al límite el botón se bloquea y lo dice
  while (civ.colony.population < civ.colony.popCap) civ.colony.spawnUnit('citizen');
  ui.refresh(0, true);
  assert.equal(document.querySelector('[data-act="train"]').disabled, true);
  assert.match(ui.els.townBody.innerHTML, /vivienda/, 'avisa de que faltan casas');
});

test('la guía aparece en el primer planeta y no en los siguientes', () => {
  const { civ, ui, planet } = make();
  ui.show();
  assert.ok(civ.tutorial, 'se crea la guía al aterrizar');
  assert.equal(civ.tutorial.planetId, planet.config.id);
  assert.ok(document.getElementById('civ-tut').classList.contains('on'));
  assert.equal(document.querySelectorAll('.civ-order').length, 6);

  // Avanza sola al cumplir el paso (5 civiles en la colonia)
  civ.colony.storage.food = 500;
  for (let i = 0; i < 6; i++) { civ.colony.trainCitizen(); for (let k = 0; k < 14; k++) civ.updateColonies(0.5); }
  civ.update(0.1, {});
  assert.ok(civ.tutorial.index >= 1, `la guía avanza (índice ${civ.tutorial.index})`);

  // Se cierra y ya no vuelve a aparecer
  document.querySelector('[data-act="tut-close"]').click();
  assert.equal(document.getElementById('civ-tut').classList.contains('on'), false);
  assert.ok(document.querySelector('.civ-btn[data-act="guide"]').classList.contains('active'));
  civ.colony.build('farm').building.progress = 1;
  civ.update(0.1, {});
  ui.refresh(0, true);
  assert.equal(document.getElementById('civ-tut').classList.contains('on'), false, 'cerrada no reaparece');

  // En otro planeta la guía del primero no se muestra
  const other = {
    config: { id: 'venus', radius: 3, name: 'Venus', emoji: '♀️' },
    group: new THREE.Group(),
    worldPosition: new THREE.Vector3(),
  };
  civ.scene.add(other.group);
  civ.exit();
  civ.enter(other);
  ui.refresh(0, true);
  assert.equal(document.getElementById('civ-tut').classList.contains('on'), false, 'la guía es solo del primer planeta');
  assert.equal(civ.tutorial.planetId, 'mars');
  civ.exit();
  civ.enter(planet);
});

test('el botón de recuadro activa la selección múltiple', () => {
  const { civ, ui } = make();
  ui.show();
  assert.equal(civ.boxMode, false);
  document.querySelector('.civ-btn[data-act="box"]').click();
  assert.equal(civ.boxMode, true);
  assert.ok(document.querySelector('.civ-btn[data-act="box"]').classList.contains('active'));
  document.querySelector('.civ-btn[data-act="box"]').click();
  assert.equal(civ.boxMode, false);
});

test('el tutorial se guarda y se recupera con la partida', () => {
  const { civ } = make();
  civ.tutorial.advance();
  const data = JSON.parse(JSON.stringify(civ.serializeTutorial()));
  assert.equal(data.planetId, 'mars');

  const other = make();
  other.civ.loadTutorial(data);
  assert.equal(other.civ.tutorial.index, 1);
  assert.equal(other.civ.tutorial.planetId, 'mars');
});
