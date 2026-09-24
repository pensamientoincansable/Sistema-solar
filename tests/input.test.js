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
