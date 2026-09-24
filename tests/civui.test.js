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
