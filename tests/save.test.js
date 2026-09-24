/**
 * Pruebas del sistema de guardado (localStorage + archivos .json).
 * Se usan almacenes falsos: nada toca el navegador.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SaveSystem, SAVE_VERSION, GAME_ID, SLOT_IDS } from '../src/systems/SaveSystem.js';
import { settings } from '../src/systems/Settings.js';

function fakeStorage() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

function makeGame(state = { credits: 100, label: 'prueba', playTime: 42 }) {
  let applied = null;
  const store = fakeStorage();
  const save = new SaveSystem({
    storage: store,
    serialize: () => ({ ...state }),
    apply: (s, meta) => { applied = { s, meta }; },
  });
  return { save, store, getApplied: () => applied };
}

test('guardar y cargar un hueco devuelve el mismo estado', () => {
  const { save, getApplied } = makeGame({ credits: 250, label: 'Tierra', playTime: 90 });
  const r = save.save('slot1', 'Hueco 1');
  assert.equal(r.ok, true);
  assert.equal(r.meta.credits, 250);

  const list = save.list();
  const slot1 = list.find(s => s.id === 'slot1');
  assert.equal(slot1.empty, false);
  assert.equal(slot1.label, 'Hueco 1');

  const load = save.load('slot1');
  assert.equal(load.ok, true);
  assert.equal(getApplied().s.credits, 250);
  assert.equal(load.meta.playTime, 90);
});

test('todos los huecos existen y empiezan vacíos', () => {
  const { save } = makeGame();
  const list = save.list();
  assert.equal(list.length, SLOT_IDS.length);
  assert.ok(list.every(s => s.empty));
  assert.ok(list.some(s => s.id === 'autosave'));
});

test('cargar un hueco vacío falla con un mensaje claro', () => {
  const { save } = makeGame();
  const r = save.load('slot2');
  assert.equal(r.ok, false);
  assert.ok(r.reason.length > 0);
});

test('borrar un hueco lo deja vacío', () => {
  const { save } = makeGame();
  save.save('slot1');
  assert.equal(save.remove('slot1'), true);
  assert.equal(save.list().find(s => s.id === 'slot1').empty, true);
  assert.equal(save.remove('slot1'), false);
});

test('el autoguardado escribe en el hueco autosave', () => {
  const { save } = makeGame({ credits: 10, playTime: 1 });
  save.requireStarted = () => true;
  const r = save.autosave('prueba');
  assert.equal(r.ok, true);
  assert.equal(save.list().find(s => s.id === 'autosave').empty, false);
});

test('el autoguardado no guarda si la partida no ha empezado', () => {
  const { save } = makeGame();
  save.requireStarted = () => false;
  const r = save.autosave();
  assert.equal(r.ok, false);
  assert.equal(save.list().find(s => s.id === 'autosave').empty, true);
});

test('se rechazan archivos que no son de este juego', () => {
  assert.equal(SaveSystem.validate(null).ok, false);
  assert.equal(SaveSystem.validate({}).ok, false);
  assert.equal(SaveSystem.validate({ game: 'otro-juego', saveVersion: 1, state: {} }).ok, false);
  assert.equal(SaveSystem.validate({ game: GAME_ID, state: {} }).ok, false);
  assert.equal(SaveSystem.validate({ game: GAME_ID, saveVersion: SAVE_VERSION + 5, state: {} }).ok, false);
  assert.equal(SaveSystem.validate({ game: GAME_ID, saveVersion: SAVE_VERSION }).ok, false);
  assert.equal(SaveSystem.validate({ game: GAME_ID, saveVersion: SAVE_VERSION, state: { a: 1 } }).ok, true);
});

test('un almacén corrupto no rompe el juego', () => {
  const store = fakeStorage();
  store.setItem(`${GAME_ID}:saves:v1`, '{ esto no es JSON');
  const save = new SaveSystem({ storage: store, serialize: () => ({ credits: 1 }), apply: () => {} });
  assert.ok(save.list().every(s => s.empty));
  const r = save.save('slot1');
  assert.equal(r.ok, true, 'debe poder sobreescribir el almacén dañado');
  assert.equal(save.list().filter(s => !s.empty).length, 1);
});

test('cargar aplica también los ajustes guardados con la partida', () => {
  const store = fakeStorage();
  const save = new SaveSystem({
    storage: store,
    serialize: () => ({ credits: 5, label: 'x', playTime: 1 }),
    apply: () => {},
  });
  save.save('slot1');
  // Se modifica el almacén a mano para simular una partida de otro navegador
  const raw = JSON.parse(store.getItem(`${GAME_ID}:saves:v1`));
  raw.slot1.settings = { volume: 13, tutorialDone: true, quality: 3 };
  store.setItem(`${GAME_ID}:saves:v1`, JSON.stringify(raw));

  const before = settings.get('volume');
  save.load('slot1');
  assert.equal(settings.get('volume'), 13);
  assert.equal(settings.get('quality'), 3);
  assert.notEqual(settings.get('tutorialDone'), undefined);
  settings.set('volume', before);
});

test('una partida de una versión anterior sigue siendo válida', () => {
  const store = fakeStorage();
  const save = new SaveSystem({ storage: store, serialize: () => ({ credits: 1 }), apply: () => {} });
  const old = { game: GAME_ID, saveVersion: Math.max(0, SAVE_VERSION - 1), meta: { savedAt: new Date().toISOString() }, state: { credits: 7 } };
  store.setItem(`${GAME_ID}:saves:v1`, JSON.stringify({ slot1: old }));
  const got = save.get('slot1');
  assert.ok(got);
  assert.equal(got.state.credits, 7);
});

test('clearAll vacía el almacén completo', () => {
  const { save, store } = makeGame();
  save.save('slot1');
  save.save('slot2');
  assert.equal(save.clearAll(), true);
  assert.equal(store.map.size, 0);
  assert.ok(save.list().every(s => s.empty));
});
