/**
 * HUD: el aviso de aterrizaje usa el estilo "land" y los botones nuevos existen.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './helpers/dom.js';
import fs from 'node:fs';
import path from 'node:path';

const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
const body = html.split('<body>')[1].split('<script type="module"')[0];
installDom(`<!doctype html><html><body>${body}</body></html>`);

const { HUD } = await import('../src/ui/HUD.js');

function fakeWalle(over = {}) {
  return {
    health: 100, maxHealth: 100, trashCount: 0, trashCapacity: 50,
    credits: 60, weapon: 'laser', ammo: { laser: Infinity }, weapons: ['laser'],
    materials: {}, velocity: { length: () => 0 },
    position: { x: 0, y: 0, z: 0 },
    rotation: { y: 0 },
    ...over,
  };
}

test('el HTML incluye los botones de civilizar, cinemática, pantalla completa y la pestaña de partida', () => {
  assert.ok(document.getElementById('btn-civilize'), 'falta el botón de civilizar');
  assert.ok(document.getElementById('btn-cinematic'), 'falta el botón de visión cinemática');
  assert.ok(document.getElementById('btn-fullscreen'), 'falta el botón de pantalla completa');
  assert.ok(document.getElementById('section-save'), 'falta la pestaña de partida guardada');
  assert.ok(document.getElementById('btn-save-export'), 'falta descargar partida');
  assert.ok(document.getElementById('btn-save-import'), 'falta cargar archivo');
  assert.ok(document.getElementById('cine-bars'), 'faltan las barras cinemáticas');
  assert.equal(document.getElementById('btn-civilize').dataset.action, 'civilize');
  assert.equal(document.getElementById('btn-cinematic').dataset.action, 'cinematic');
  assert.equal(document.getElementById('btn-fullscreen').dataset.action, 'fullscreen');
});

test('el HUD pinta el aviso de aterrizar con la clase ctx-land', () => {
  const hud = new HUD();
  const ctx = {
    type: 'land',
    key: 'MANTÉN G',
    text: 'Aterrizar y civilizar 🌍 Tierra (8 u de altitud)',
    progress: 0.4,
  };
  hud._updateTexts({ walle: fakeWalle(), solarSystem: null, context: ctx });
  const prompt = document.getElementById('context-prompt');
  assert.ok(prompt.className.includes('ctx-land'), `clases: ${prompt.className}`);
  assert.ok(!prompt.classList.contains('hidden'));
  assert.equal(document.getElementById('context-key').textContent, 'MANTÉN G');
  assert.match(document.getElementById('context-text').textContent, /Tierra/);
  const fill = document.getElementById('context-progress-fill');
  assert.equal(fill.style.width, '40%');
});

test('sin contexto el aviso se oculta', () => {
  const hud = new HUD();
  hud._updateTexts({ walle: fakeWalle(), solarSystem: null, context: { type: 'land', key: 'G', text: 'x' } });
  hud._updateTexts({ walle: fakeWalle(), solarSystem: null, context: null });
  const prompt = document.getElementById('context-prompt');
  assert.ok(prompt.classList.contains('hidden'));
});
