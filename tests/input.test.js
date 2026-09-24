/**
 * Teclado: G (civilizar, mantener), B (cinemática), H (pantalla completa).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './helpers/dom.js';

const dom = installDom('<!doctype html><html><body><canvas id="c"></canvas></body></html>');
const canvas = dom.window.document.getElementById('c');

const { InputSystem } = await import('../src/core/Input.js');

function key(target, type, code) {
  const ev = new dom.window.KeyboardEvent(type, { code, bubbles: true, cancelable: true });
  target.dispatchEvent(ev);
}

test('mantener G activa civilizeHeld y soltarla lo apaga', () => {
  const input = new InputSystem(canvas);
  input.update();
  assert.equal(input.civilizeHeld, false);
  key(dom.window, 'keydown', 'KeyG');
  input.update();
  assert.equal(input.civilizeHeld, true);
  key(dom.window, 'keyup', 'KeyG');
  input.update();
  assert.equal(input.civilizeHeld, false);
});

test('B enciende el evento de visión cinemática (se consume una sola vez)', () => {
  const input = new InputSystem(canvas);
  assert.equal(input.consumeCinematicToggle(), false);
  key(dom.window, 'keydown', 'KeyB');
  assert.equal(input.consumeCinematicToggle(), true);
  assert.equal(input.consumeCinematicToggle(), false, 'el evento es puntual');
});

test('H enciende el evento de pantalla completa (se consume una sola vez)', () => {
  const input = new InputSystem(canvas);
  key(dom.window, 'keydown', 'KeyH');
  assert.equal(input.consumeFullscreenToggle(), true);
  assert.equal(input.consumeFullscreenToggle(), false);
});

test('flushEvents descarta cinemática y pantalla completa pendientes', () => {
  const input = new InputSystem(canvas);
  key(dom.window, 'keydown', 'KeyB');
  key(dom.window, 'keydown', 'KeyH');
  input.flushEvents();
  assert.equal(input.consumeCinematicToggle(), false);
  assert.equal(input.consumeFullscreenToggle(), false);
});

test('el canal táctil de civilizar se combina con el teclado', () => {
  const input = new InputSystem(canvas);
  input.touch.civilize = true;
  input.update();
  assert.equal(input.civilizeHeld, true);
  input.touch.civilize = false;
  input.update();
  assert.equal(input.civilizeHeld, false);
});

test('releaseAll suelta también civilize táctil', () => {
  const input = new InputSystem(canvas);
  input.touch.civilize = true;
  input.releaseAll();
  input.update();
  assert.equal(input.touch.civilize, false);
  assert.equal(input.civilizeHeld, false);
});

function keyEv(target, type, code, repeat = false) {
  const ev = new dom.window.KeyboardEvent(type, { code, repeat, bubbles: true, cancelable: true });
  target.dispatchEvent(ev);
}

test('tras releaseAll, la autorrepetición de G no vuelve a activar civilizeHeld (no expulsa de la colonia)', () => {
  const input = new InputSystem(canvas);
  keyEv(dom.window, 'keydown', 'KeyG');
  input.update();
  assert.equal(input.civilizeHeld, true);
  // Aterrizaje: el juego libera la entrada con G aún pulsada
  input.releaseAll();
  input.update();
  assert.equal(input.civilizeHeld, false);
  // El teclado sigue autorrepitiendo mientras el jugador mantiene G
  keyEv(dom.window, 'keydown', 'KeyG', true);
  keyEv(dom.window, 'keydown', 'KeyG', true);
  input.update();
  assert.equal(input.civilizeHeld, false, 'las repeticiones no cuentan como pulsación nueva');
  // Suelta y vuelve a pulsar: ahora sí cuenta
  keyEv(dom.window, 'keyup', 'KeyG');
  keyEv(dom.window, 'keydown', 'KeyG');
  input.update();
  assert.equal(input.civilizeHeld, true);
  keyEv(dom.window, 'keyup', 'KeyG');
});

test('una pulsación nueva desbloquea la tecla aunque se perdiera el keyup', () => {
  const input = new InputSystem(canvas);
  keyEv(dom.window, 'keydown', 'KeyW');
  input.releaseAll();
  keyEv(dom.window, 'keydown', 'KeyW', true);
  input.update();
  assert.equal(input.moveY, 0);
  keyEv(dom.window, 'keydown', 'KeyW');   // sin keyup previo (p. ej. tras perder el foco)
  input.update();
  assert.ok(input.moveY > 0);
  keyEv(dom.window, 'keyup', 'KeyW');
});

test('liberar el puntero desde el juego no dispara onPointerLockLost; perderlo por Esc sí', () => {
  const input = new InputSystem(canvas);
  let lost = 0;
  input.onPointerLockLost = () => { lost++; };
  const doc = dom.window.document;
  let lockEl = null;
  Object.defineProperty(doc, 'pointerLockElement', { configurable: true, get: () => lockEl });
  doc.exitPointerLock = () => { lockEl = null; doc.dispatchEvent(new dom.window.Event('pointerlockchange')); };

  // Captura y liberación pedida por el juego (aterrizaje)
  lockEl = canvas;
  doc.dispatchEvent(new dom.window.Event('pointerlockchange'));
  assert.equal(input.mouse.locked, true);
  input.exitPointerLock();
  assert.equal(input.mouse.locked, false);
  assert.equal(lost, 0, 'aterrizar no debe pausar el juego');

  // Captura y pérdida externa (el jugador pulsa Esc en el navegador)
  lockEl = canvas;
  doc.dispatchEvent(new dom.window.Event('pointerlockchange'));
  lockEl = null;
  doc.dispatchEvent(new dom.window.Event('pointerlockchange'));
  assert.equal(lost, 1);
  delete doc.pointerLockElement;
});
