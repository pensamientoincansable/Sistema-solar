/**
 * Flujo de aterrizaje en Game: la pérdida de captura del ratón al aterrizar ni
 * la pausa deben sacar al jugador de la colonia (antes volvía al espacio y se
 * abría el menú nada más entrar).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './helpers/dom.js';

installDom('<!doctype html><html><body><canvas id="c"></canvas><div id="hud"></div></body></html>');
const { Game } = await import('../src/core/Game.js');

function fakeGame(overrides = {}) {
  const calls = [];
  const g = Object.create(Game.prototype);
  Object.assign(g, {
    canvas: document.getElementById('c'),
    camera: { aspect: 1, updateProjectionMatrix() {} },
    renderer: { setSize() {} },
    isPlaying: true, isPaused: false, hasStarted: true, isCivMode: true, shopOpen: false, touch: false,
    civ: { active: true, planet: { config: { id: 'earth' } } },
    input: {
      civilizeHeld: false,
      releaseAll() { calls.push('releaseAll'); }, exitPointerLock() { calls.push('exitPointerLock'); },
      requestPointerLock() { calls.push('requestPointerLock'); }, flushEvents() {},
    },
    hud: { show() { calls.push('hud.show'); }, hide() { calls.push('hud.hide'); }, notify() {} },
    civUI: { show() { calls.push('civUI.show'); }, hide() { calls.push('civUI.hide'); } },
    menu: { show() { calls.push('menu.show'); }, hide() { calls.push('menu.hide'); }, setContinueVisible() {} },
    mobile: { isMobile: false, setVisible(v) { calls.push(`mobile.${v}`); } },
    save: { autosave() {} },
    tutorial: null,
    clock: { start() {} },
    exitCivMode() { calls.push('exitCivMode'); this.isCivMode = false; return true; },
    _syncFullscreenButton() {},
  }, overrides);
  return { g, calls };
}

test('perder la captura del ratón dentro de la colonia no pausa ni saca al jugador', () => {
  const { g, calls } = fakeGame();
  let paused = 0;
  g.pauseGame = () => { paused++; };
  g.bindEvents();
  g.input.onPointerLockLost();
  assert.equal(paused, 0);
  assert.equal(g.isCivMode, true);
  assert.ok(!calls.includes('exitCivMode'));
});

test('fuera de la colonia, perder la captura del ratón sigue pausando', () => {
  const { g } = fakeGame({ isCivMode: false });
  let paused = 0;
  g.pauseGame = () => { paused++; };
  g.bindEvents();
  g.input.onPointerLockLost();
  assert.equal(paused, 1);
});

test('pausar en la colonia no despega: al reanudar se vuelve a la superficie', () => {
  const { g, calls } = fakeGame();
  g.pauseGame();
  assert.equal(g.isCivMode, true, 'la colonia sigue activa durante la pausa');
  assert.ok(!calls.includes('exitCivMode'));
  assert.ok(calls.includes('civUI.hide'));
  assert.ok(calls.includes('menu.show'));
  calls.length = 0;
  g.resumeGame();
  assert.equal(g.isPlaying, true);
  assert.ok(calls.includes('civUI.show'), 'reaparece el panel de estrategia');
  assert.ok(!calls.includes('hud.show'), 'no se muestra el HUD de vuelo');
  assert.ok(!calls.includes('requestPointerLock'), 'en la colonia el ratón va libre');
});
