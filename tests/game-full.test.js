/**
 * Prueba de integración con el objeto Game COMPLETO (constructor real, todos
 * los subsistemas) usando un contexto WebGL falsificado, para reproducir la
 * sesión real del jugador: cargar una partida guardada, jugar, y aterrizar en
 * un planeta desbloqueado.
 *
 * El bucle rAF se conduce a mano con dt fijo (jsdom no renderiza de verdad).
 */
import test from 'node:test';
import { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { installDom } from './helpers/dom.js';
import { installHeadlessGraphics } from './helpers/headless-gl.js';

const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
const body = html.split('<body>')[1].split('<script type="module"')[0];
installDom(`<!doctype html><html><body>${body}</body></html>`);
installHeadlessGraphics();

const { Game } = await import('../src/core/Game.js');

const DT = 1 / 60;
const _games = [];

function buildFullGame() {
  const canvas = document.getElementById('game-canvas');
  const game = new Game(canvas);
  // Detener el bucle rAF: se conduce la partida a mano con dt fijo
  game.animate = () => {};
  _games.push(game);
  return game;
}

/** N frames del bucle de vuelo (mismo orden que Game.animate -> _updateGame). */
function step(game, n, { civilizeKey = false } = {}) {
  for (let i = 0; i < n; i++) {
    if (game.input) {
      game.input.keys['keyg'] = civilizeKey;
      game.input.update();
    }
    game._realDelta = DT;
    if (game.isPlaying && !game.shopOpen && game.walle) {
      if (game.isCivMode) game._updateCiv(DT);
      else game._updateGame(DT, i * DT);
    }
    if (game.save) game.save.tick(DT);
  }
}

/**
 * Teardown: sin esto, el setInterval de autosave y el rAF de jsdom
 * (pretendToBeVisual) mantienen vivo el event loop y el test nunca termina.
 */
after(() => {
  for (const g of _games) {
    try { g.save && g.save.dispose(); } catch (e) { /* noop */ }
  }
  try { window.close(); } catch (e) { /* noop */ }
});

function makeSaveState(game, built, inventory) {
  const earth = game.solarSystem.getPlanetById('earth');
  return {
    label: '1/8 planetas · 60 CR',
    playTime: 600,
    credits: 120,
    planetsColonized: Object.keys(built).length,
    savedInCiv: null,
    walle: {
      position: earth.worldPosition.toArray().map((v) => v + 20),
      rotation: [0, 0, 0],
      health: 100, credits: 120,
      upgrades: {}, weapons: ['laser', 'plasma'], weapon: 'laser',
      ammo: { laser: -1, plasma: 50, scatter: -1, missile: 0 },
      materials: {}, trashCount: 0, zoomTarget: 1,
    },
    civilization: {
      inventory: { metal: 0, polymer: 0, glass: 0, energy: 0, bio: 0, water: 0, gas: 0, ice: 0, crystal: 0, concrete: 0, ...inventory },
      built,
      totalBuilt: Object.keys(built).length,
    },
    colonies: {},
    civTutorial: null,
    refinery: [],
    stats: { kills: 0, deposited: 0, trashCollected: 0, landings: 0 },
    flags: { won: false, missionBegun: true },
  };
}

test('cargar una partida guardada deja las lluvias de asteroides ACTIVAS (regresión: 0 asteroides tras cargar)', () => {
  const game = buildFullGame();
  assert.ok(game.asteroids, 'el sistema de asteroides debe existir');
  assert.ok(game.civilization, 'el gestor de civilizaciones debe existir');
  assert.ok(game.civ, 'el modo civilizar debe existir');

  // Simula una partida guardada de la versión anterior (con accesos y sin colonias 3D)
  const saveState = makeSaveState(game, { venus: 1, neptune: 1 }, { metal: 100, bio: 40, water: 80, gas: 100, ice: 50, crystal: 50 });
  const r = game._applyState(saveState, { label: 'Autosave' });
  assert.equal(r.ok, true, `el guardado debe cargar: ${r.reason || ''}`);
  assert.equal(game.hasStarted, true);
  assert.ok(game.civilization.isUnlocked('venus'), 'Venus desbloqueado');
  assert.ok(game.civilization.isUnlocked('neptune'), 'Neptuno desbloqueado');

  // La misión sigue activa: las lluvias de asteroides deben estar habilitadas
  assert.equal(game.asteroids.enabled, true,
    'tras cargar la partida la misión sigue activa: asteroides habilitados');
  game.exitCivMode?.({ silent: true });
});

test('mantener G volando bajo en un planeta desbloqueado entra al modo civilización (partida cargada)', () => {
  const game = buildFullGame();
  const earth = game.solarSystem.getPlanetById('earth');
  const saveState = makeSaveState(game, { earth: 1 }, { metal: 50, bio: 100, water: 80 });
  const r = game._applyState(saveState, { label: 'Autosave' });
  assert.equal(r.ok, true, `el guardado debe cargar: ${r.reason || ''}`);

  // Vuelo bajo sobre la Tierra
  const p = earth.worldPosition.clone().addScaledVector(earth.worldPosition.clone().normalize(), earth.config.radius + 8);
  game.walle.position.copy(p);
  game.walle.velocity.set(0, 0, 0);
  game.walle.group.position.copy(p);

  // Mantener G durante 2 s de juego (LAND_HOLD_TIME = 1,5 s)
  step(game, 120, { civilizeKey: true });
  assert.equal(game.isCivMode, true, 'debe haber entrado en el modo civilización');
  assert.equal(game.civ.active, true);
  assert.equal(game.civ.planet && game.civ.planet.config.id, 'earth');
});

