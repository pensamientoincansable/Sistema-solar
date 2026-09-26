/**
 * Escenarios completos con el Game REAL (todos los subsistemas):
 *
 * A) Sesión móvil NUEVA: tutorial -> jugar -> mantener 🌍 sobre un planeta
 *    desbloqueado -> entrar en la colonia.
 * B) Sesión móvil CONTINUADA (la del jugador): carga de partida -> 20 min de
 *    juego (¿hay lluvias de asteroides?) -> desbloquear Neptuno y Venus ->
 *    volar hasta Neptuno -> mantener 🌍 -> entrar en la colonia.
 * C) Sesión PC continuada: lo mismo con la tecla G.
 */
import test from 'node:test';
import { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { installDom } from './helpers/dom.js';

const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
const body = html.split('<body>')[1].split('<script type="module"')[0];
installDom(`<!doctype html><html><body>${body}</body></html>`);

import { installHeadlessGraphics } from './helpers/headless-gl.js';
installHeadlessGraphics();

const { Game } = await import('../src/core/Game.js');

const _games = [];
function freshGame() {
  // cada prueba parte de un DOM limpio de partidas/ajustes
  try { window.localStorage.clear(); } catch (e) { /* noop */ }
  const game = new Game(document.getElementById('game-canvas'));
  // Detener el bucle rAF de jsdom: se conduce la partida a mano con dt fijo
  game.animate = () => {};
  _games.push(game);
  return game;
}

// Teardown: sin esto, el setInterval de autosave y el rAF de jsdom
// (pretendToBeVisual) mantienen vivo el event loop y el test nunca termina.
after(() => {
  for (const g of _games) {
    try { g.save && g.save.dispose(); } catch (e) { /* noop */ }
  }
  try { window.close(); } catch (e) { /* noop */ }
});

const DT = 1 / 60;

/**
 * N frames del bucle de vuelo (mismo orden que Game.animate -> _updateGame).
 * civilizeKey mantiene G (PC); touchCivilize mantiene el botón 🌍 (móvil).
 */
function step(g, n, { civilizeKey = false, touchCivilize = null } = {}) {
  for (let i = 0; i < n; i++) {
    if (g.input) {
      g.input.keys['keyg'] = civilizeKey;
      if (touchCivilize !== null) g.input.touch.civilize = touchCivilize;
      g.input.update();
    }
    g._realDelta = DT;
    if (g.isPlaying && !g.shopOpen && g.walle) {
      if (g.isCivMode) g._updateCiv(DT);
      else g._updateGame(DT, i * DT);
    }
    if (g.save) g.save.tick(DT);
  }
}

/** Vuela a baja altitud sobre el planeta indicado. */
function flyTo(g, planetId, altitude = 10) {
  const planet = g.solarSystem.getPlanetById(planetId);
  const p = planet.worldPosition.clone();
  const outward = p.clone().normalize();
  p.addScaledVector(outward, planet.config.radius + altitude);
  g.walle.position.copy(p);
  g.walle.velocity.set(0, 0, 0);
  g.walle.group.position.copy(p);
  return planet;
}

function makeSave(g, { built, inventory, playTime = 600 } = {}) {
  const earth = g.solarSystem.getPlanetById('earth');
  return {
    label: '1/8 planetas · 120 CR',
    playTime,
    credits: 120,
    planetsColonized: Object.keys(built).length,
    savedInCiv: null,
    walle: {
      position: earth.worldPosition.toArray().map((v) => v + 30),
      rotation: [0, 0, 0],
      health: 100,
      credits: 120,
      upgrades: {},
      weapons: ['laser', 'plasma'],
      weapon: 'laser',
      ammo: { laser: -1, plasma: 50, scatter: -1, missile: 0 },
      materials: {},
      trashCount: 0,
      zoomTarget: 1,
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

test('A) móvil, partida nueva: tras el tutorial, mantener 🌍 sobre un planeta desbloqueado entra a la colonia', () => {
  const g = freshGame();
  g.touch = true; // forzar perfil táctil (jsdom no es un móvil)
  assert.ok(g.asteroids && g.civilization && g.civ, 'subsistemas presentes');

  g.startGame();
  assert.equal(g.hasStarted, true);
  // En móvil arranca el tutorial (tutorialDone=false)
  assert.ok(g.tutorial && g.tutorial.active, 'el tutorial táctil debería estar activo');
  g.tutorial.finish(true); // el jugador lo completa/salta
  assert.equal(g.asteroids.enabled, true, 'al terminar el tutorial la misión (y los asteroides) se activan');

  // Desbloquear la Tierra con materiales y volar hasta ella
  g.civilization.addMaterials({ bio: 100, metal: 50, water: 80 });
  g.civilization.build('earth');
  assert.ok(g.civilization.isUnlocked('earth'));
  flyTo(g, 'earth', 10);

  step(g, 5);
  assert.ok(g._context, 'cerca de la Tierra debe haber barra de acción');
  assert.ok(['land', 'deposit', 'repair'].includes(g._context.type), `contexto: ${g._context.type}`);

  // Mantener el botón 🌍 (canal táctil, como el botón real)
  step(g, 100, { touchCivilize: true });
  assert.equal(g.isCivMode, true, 'debería haber aterrizado en la Tierra');
  assert.equal(g.civ.active, true);
  assert.equal(g.civ.planet.config.id, 'earth');
  g.exitCivMode({ silent: true });
});

test('B) móvil, partida CONTINUADA: 20 min con lluvias de asteroides y acceso a Neptuno/Venus', () => {
  const g = freshGame();
  g.touch = true;
  const save = makeSave(g, {
    built: { mercury: 1, mars: 1 },
    inventory: { metal: 100, gas: 100, ice: 50, crystal: 50, water: 100, polymer: 50, bio: 40 },
    playTime: 1200,
  });
  const r = g._applyState(save, { label: 'Auto' });
  assert.equal(r.ok, true, `carga de la partida: ${r.reason || ''}`);
  assert.equal(g.hasStarted, true);
  assert.equal(g.isPlaying, true);

  // --- 7 minutos de juego en móvil (comprueba el intervalo de oleadas) ---
  const waves = [];
  const t0 = g.playTime; // la partida trae su playTime; medimos tiempo RELATIVO
  g.asteroids.onWaveStart = (target, count) => waves.push({ t: g.playTime - t0, count });
  flyTo(g, 'mars', 40);
  step(g, 7 * 60 * 60);
  assert.ok(g.asteroids.enabled, 'tras cargar la partida las lluvias deben estar activas');
  assert.ok(waves.length >= 3, `en 7 min deben llegar ≥3 oleadas (hubo ${waves.length})`);
  assert.ok(waves[0].t <= 180, `primera oleada a los ${Math.round(waves[0].t)} s (máx 180)`);
  for (let i = 1; i < waves.length; i++) {
    const gap = waves[i].t - waves[i - 1].t;
    assert.ok(gap <= 190, `oleada ${i + 1} a ${Math.round(gap)} s de la anterior (máx ~190: evento cada 3 min)`);
  }

  // --- Desbloquear Neptuno y Venus desde el menú ---
  g.civilization.addMaterials({ water: 50, crystal: 50, gas: 50 }); // Neptuno: 130/80/70
  g.civilization.addMaterials({ polymer: 100, metal: 100, gas: 50 }); // Venus: 100/60/80
  const rNeptune = g.civilization.build('neptune');
  const rVenus = g.civilization.build('venus');
  assert.equal(rNeptune.can, true, `desbloquear Neptuno: ${rNeptune.reason || rNeptune.missing || ''}`);
  assert.equal(rVenus.can, true, `desbloquear Venus: ${rVenus.reason || rVenus.missing || ''}`);

  // --- Volar a Neptuno y mantener 🌍 ---
  flyTo(g, 'neptune', 10);
  step(g, 10);
  assert.ok(g._context, 'junto a Neptuno debe aparecer la barra de acción');
  assert.equal(g._context.type, 'land', `la barra debe invitar a aterrizar (era ${g._context && g._context.type})`);

  step(g, 100, { touchCivilize: true });
  assert.equal(g.isCivMode, true, 'debe entrar en la colonia de Neptuno');
  assert.equal(g.civ.planet.config.id, 'neptune');
  g.exitCivMode({ silent: true });

  // --- Y también a Venus ---
  flyTo(g, 'venus', 10);
  step(g, 10);
  assert.equal(g._context && g._context.type, 'land', 'junto a Venus: barra de aterrizaje');
  step(g, 100, { touchCivilize: true });
  assert.equal(g.isCivMode, true, 'debe entrar en la colonia de Venus');
  assert.equal(g.civ.planet.config.id, 'venus');
});

test('D) móvil: el botón grande contextual muestra ATERRIZAR y mantenerlo entra a la colonia', () => {
  const g = freshGame();
  g.touch = true;
  const save = makeSave(g, {
    built: { mars: 1 },
    inventory: { metal: 100 },
    playTime: 600,
  });
  const r = g._applyState(save, { label: 'Auto' });
  assert.equal(r.ok, true, `carga de la partida: ${r.reason || ''}`);

  flyTo(g, 'mars', 10);
  step(g, 10);
  assert.ok(['land', 'deposit'].includes(g._context && g._context.type), `contexto: ${g._context && g._context.type}`);

  // Si recogió basura de camino, la barra muestra DEPOSITAR; la dejamos libre
  // para ver la barra ATERRIZAR.
  if (g._context && g._context.type === 'deposit') {
    g.walle.trashCount = 0;
    step(g, 2);
  }
  assert.equal(g._context && g._context.type, 'land', 'junto a un planeta desbloqueado la barra invita a aterrizar');
  assert.equal(g.mobile._actionContext, 'land', 'el botón grande contextual recibe el contexto "land"');

  // Mantener el botón grande = mantener 🌍/G (misma ruta que el toque real)
  g.mobile._setAction('action', true);
  assert.equal(g.input.touch.civilize, true, 'mantener el botón grande debe activar el canal de civilizar');
  step(g, 100);
  assert.equal(g.isCivMode, true, 'debe haber aterrizado en Marte');
  assert.equal(g.civ.planet.config.id, 'mars');
  g.mobile._setAction('action', false);
  g.exitCivMode({ silent: true });
});

test('E) guardar DENTRO de una colonia, cargar y volver a entrar: la colonia persiste', () => {
  const g = freshGame();
  g.touch = true;
  const save = makeSave(g, {
    built: { venus: 1 },
    inventory: { polymer: 100, metal: 100, gas: 50 },
    playTime: 900,
  });
  const r = g._applyState(save, { label: 'Auto' });
  assert.equal(r.ok, true, `carga de la partida: ${r.reason || ''}`);

  // 1) Aterrizamos en Venus y construimos una casa (la colonia queda viva)
  flyTo(g, 'venus', 10);
  step(g, 10);
  step(g, 100, { touchCivilize: true });
  assert.equal(g.isCivMode, true, 'entrada inicial a Venus');
  const colony = g.civ.colony;
  assert.ok(colony, 'la colonia existe');
  g.civ.setPendingBuild('house');
  const built = g.civ.confirmBuild();
  assert.ok(built.ok, `construir una casa: ${built.reason || ''}`);
  const count = colony.buildings.length;
  assert.ok(count >= 1, `la colonia tiene edificios (${count})`);
  g.exitCivMode({ silent: true });
  assert.equal(g.isCivMode, false);

  // 2) Guardar y cargar por el sistema real (localStorage)
  const saved = g.save.save('slot1', 'Test');
  assert.equal(saved.ok, true, `guardar: ${saved.reason || ''}`);
  const loaded = g.save.load('slot1');
  assert.equal(loaded.ok, true, `cargar: ${loaded.reason || ''}`);
  assert.equal(g.hasStarted, true);
  assert.equal(g.isPlaying, true);

  // 3) Volver a entrar: la colonia guardada debe estar ahí, con la casa
  flyTo(g, 'venus', 10);
  step(g, 10);
  step(g, 100, { touchCivilize: true });
  assert.equal(g.isCivMode, true, 'segunda entrada a Venus tras cargar');
  assert.equal(g.civ.planet.config.id, 'venus');
  assert.ok(g.civ.colony.buildings.length >= count,
    `la colonia persiste tras guardar/cargar (${g.civ.colony.buildings.length} >= ${count})`);
  g.exitCivMode({ silent: true });
});

test('C) PC, partida continuada: mantener G sobre un planeta desbloqueado entra al modo civilización', () => {
  const g = freshGame();
  const save = makeSave(g, {
    built: { earth: 1 },
    inventory: { bio: 100, metal: 50, water: 80 },
    playTime: 900,
  });
  const r = g._applyState(save, { label: 'Auto' });
  assert.equal(r.ok, true, `carga de la partida: ${r.reason || ''}`);
  assert.equal(g.asteroids.enabled, true, 'la misión sigue activa tras cargar');

  flyTo(g, 'earth', 10);
  step(g, 10);
  assert.ok(g._context, 'junto a la Tierra: barra de acción');
  assert.ok(['land', 'deposit', 'repair'].includes(g._context.type), `contexto ${g._context && g._context.type}`);

  step(g, 100, { civilizeKey: true });
  assert.equal(g.isCivMode, true, 'mantener G debe entrar al modo civilización');
  assert.equal(g.civ.active, true);
  assert.equal(g.civ.planet.config.id, 'earth');

  // Soltar G dentro no saca; mantener de nuevo y soltar despega
  step(g, 60, { civilizeKey: false });
  assert.equal(g.isCivMode, true, 'soltar G dentro de la colonia no debe despegar');
  step(g, 30, { civilizeKey: true });
  step(g, 5, { civilizeKey: false });
  assert.equal(g.isCivMode, false, 'mantener G otra vez y soltar despega');
});

