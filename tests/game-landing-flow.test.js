/**
 * Flujo completo de aterrizaje/civilizar con las clases REALES (Game + SolarSystem
 * + WallE + Refinery + AsteroidSystem + CivMode): reproduce el escenario del
 * jugador: desbloquear un planeta, volar hasta él, mantener G/🌍 y entrar en la
 * colonia; además comprueba que las lluvias de asteroides ocurren cada pocos
 * minutos (no una vez a la hora).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { installDom } from './helpers/dom.js';

const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
const body = html.split('<body>')[1].split('<script type="module"')[0];
installDom(`<!doctype html><html><body>${body}</body></html>`);

// --- Artefactos de jsdom: canvas 2D sin paquete `canvas` y fetch sin servidor ---
const _gradient = { addColorStop() {} };
const ctx2dStub = () => ({
  createRadialGradient: () => _gradient,
  createLinearGradient: () => _gradient,
  fillRect() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
  moveTo() {}, lineTo() {}, closePath() {},
  fillText() {}, strokeText() {},
  getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h) * 4), width: w, height: h }),
  putImageData() {},
  scale() {}, translate() {}, rotate() {}, save() {}, restore() {},
  measureText: () => ({ width: 0 }),
  canvas: null,
});
globalThis.window.HTMLCanvasElement.prototype.getContext = function (kind) {
  if (kind === '2d') {
    if (!this.__ctx2d) { this.__ctx2d = ctx2dStub(); this.__ctx2d.canvas = this; }
    return this.__ctx2d;
  }
  return null;
};
// Sin servidor de assets: las cargas de GLB/texturas fallan rápido y limpiamente
globalThis.fetch = () => Promise.reject(new Error('offline-test'));
process.on('unhandledRejection', () => { /* cargas de assets descartadas en jsdom */ });

const THREE = await import('three');
const { Game } = await import('../src/core/Game.js');
const { InputSystem } = await import('../src/core/Input.js');
const { SolarSystem } = await import('../src/entities/SolarSystem.js');
const { WallE } = await import('../src/entities/WallE.js');
const { Refinery } = await import('../src/entities/Refinery.js');
const { TrashSystem } = await import('../src/entities/Trash.js');
const { WaterSystem } = await import('../src/entities/WaterSystem.js');
const { AsteroidSystem } = await import('../src/entities/AsteroidSystem.js');
const { CivilizationManager } = await import('../src/entities/Civilization.js');
const { CivMode } = await import('../src/civ/CivMode.js');
const { CivUI } = await import('../src/ui/CivUI.js');
const { HUD } = await import('../src/ui/HUD.js');

const QUALITY = {
  deviceType: 'pc', qualityLevel: 2, pixelRatio: 1, particleMax: 800,
  trashCount: 150, waterCount: 60, enemyCount: 9, asteroidsPerWave: 5,
  renderDistance: 1500, lowresTextures: false,
};

function makeGame({ touch = false } = {}) {
  const g = Object.create(Game.prototype);
  g.canvas = document.getElementById('game-canvas');
  g.scene = new THREE.Scene();
  g.camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 4000);
  g.renderer = { domElement: g.canvas };
  g.clock = new THREE.Clock();
  g.isPlaying = false;
  g.isPaused = false;
  g.hasStarted = false;
  g.shopOpen = false;
  g.touch = touch;
  g._notifyTimes = {};
  g._pickupAgg = { trash: 0, water: 0, timer: 0 };
  g._lastHealth = 100;
  g.isCivMode = false;
  g._landHold = 0;
  g._landTarget = null;
  g._civHeldPrev = false;
  g._civHeldArmed = false;
  g.playTime = 0;
  g._objTimer = 0;
  g._objective = '';
  g._stats = { kills: 0, deposited: 0, trashCollected: 0, landings: 0 };
  g.quality = { ...QUALITY, deviceType: touch ? 'mobile' : 'pc' };

  g.solarSystem = new SolarSystem(g.scene, null, { lowres: false });
  g.walle = new WallE(g.scene, g.camera);
  g.trashSystem = new TrashSystem(g.scene, g.solarSystem, g.quality);
  g.water = new WaterSystem(g.scene, g.solarSystem, g.quality);
  g.refinery = new Refinery(g.scene, g.solarSystem, null);
  g.asteroids = new AsteroidSystem(g.scene, g.refinery, null, g.trashSystem, g.quality);
  g.civilization = new CivilizationManager(g.solarSystem);
  g.civ = new CivMode(g.scene, g.renderer, {});
  g.civUI = new CivUI(g.civ, {
    onExit: () => g.exitCivMode(),
    onNotify: () => {},
    onExport: () => {},
  });
  g.hud = new HUD();
  g.input = new InputSystem(g.canvas);
  g.taxi = null;
  g.menu = { show() {}, hide() {}, setContinueVisible() {}, updateMaterials() {}, refreshSaves() {} };
  g.mobile = { isMobile: touch, setVisible() {}, setActionContext() {}, setWeaponLabel() {} };
  g.save = { autosave() {}, tick() {}, requireStarted() {}, startAutosave() {}, stopAutosave() {} };
  g.tutorial = null;
  g.combat = null;
  g.enemySystem = null;
  g.adaptive = null;
  return g;
}

/** Pausa de la partida: WALL·E junto al planeta dado, a la altitud indicada. */
function flyTo(g, planetId, altitude = 10) {
  const planet = g.solarSystem.getPlanetById(planetId);
  const p = planet.worldPosition.clone();
  p.addScaledVector(p.clone().normalize(), planet.config.radius + altitude);
  g.walle.position.copy(p);
  g.walle.velocity.set(0, 0, 0);
  g.walle.group.position.copy(p);
}

/** N frames simulando el bucle de juego (delta fijo 1/60). */
function runFrames(g, frames, { civilizeHeld = false } = {}) {
  for (let i = 0; i < frames; i++) {
    const dt = 1 / 60;
    g._realDelta = dt;
    g.input.civilizeHeld = civilizeHeld;   // simula mantener G (PC) o 🌍 (móvil)
    // mismo orden que Game.animate -> _updateGame
    if (g.isCivMode) { g._updateCiv(dt); }
    else {
      g.playTime += dt;
      g._updateLanding(dt);
      if (g.civ) g.civ.updateColonies(dt);
      g.walle.update(dt, g.input, g.solarSystem);
      g.solarSystem.update(dt, g.clock.elapsedTime);
      g.trashSystem.update(dt, g.walle.position, g.walle);
      g.refinery.update(dt);
      g.asteroids.update(dt, g.walle);
      g.handleShooting();
      g.handleCollection(dt);
      g.handleActions(dt);
      g._objTimer = -1;
      g._objective = g._computeObjective();
    }
  }
}

test('mantener G junto a un planeta desbloqueado entra en el modo civilización', () => {
  const g = makeGame();
  g.civilization.built.earth = 1;          // acceso desbloqueado
  flyTo(g, 'earth', 10);

  // 1) Cerca del planeta debe existir un contexto de acción. Si WALL·E recogió
  //    basura de camino, "depositar" tiene prioridad en la barra (comportamiento
  //    correcto: shop > refinería > aterrizaje), pero la diana de aterrizaje
  //    queda calculada igualmente (el caso de barra "land" sin carga lo cubre
  //    la prueba de Venus/Neptuno).
  runFrames(g, 5, { civilizeHeld: false });
  assert.ok(g._context, 'debe existir un contexto de acción cerca del planeta');
  assert.ok(
    ['land', 'deposit'].includes(g._context.type),
    `contexto esperado "land" (o "deposit" si hay carga), era ${g._context && g._context.type}`
  );
  assert.equal(g._landTarget && g._landTarget.config.id, 'earth');

  // 2) Mantener G 1.6 s aterriza
  runFrames(g, 96, { civilizeHeld: true });
  assert.equal(g.isCivMode, true, 'debería estar en el modo civilización');
  assert.equal(g.civ.active, true);
  assert.equal(g.civ.planet && g.civ.planet.config.id, 'earth');
  assert.ok(g.civ.colony, 'debe existir la colonia');
  g.civ.exit();
});

test('soltar G al instante no aterriza (se necesita mantener)', () => {
  const g = makeGame();
  g.civilization.built.earth = 1;
  flyTo(g, 'earth', 10);
  runFrames(g, 20, { civilizeHeld: true });
  assert.equal(g.isCivMode, false, 'mantener 0.33 s no debería bastar');
  g.civ.exit();
});

test('planeta NO desbloqueado muestra "land-locked" y no permite entrar', () => {
  const g = makeGame();
  flyTo(g, 'neptune', 10);
  runFrames(g, 5);
  assert.equal(g._context && g._context.type, 'land-locked');
  runFrames(g, 96, { civilizeHeld: true });
  assert.equal(g.isCivMode, false, 'sin desbloquear no se puede entrar');
  g.civ.exit();
});

test('se puede entrar en Venus y en Neptuno tras desbloquearlos', () => {
  for (const id of ['venus', 'neptune']) {
    const g = makeGame();
    g.civilization.built[id] = 1;
    flyTo(g, id, 10);
    runFrames(g, 5);
    assert.equal(g._context && g._context.type, 'land', `contexto de ${id}`);
    runFrames(g, 96, { civilizeHeld: true });
    assert.equal(g.isCivMode, true, `debe poder entrar en ${id}`);
    assert.equal(g.civ.planet.config.id, id);
    g.exitCivMode({ silent: true });
    assert.equal(g.isCivMode, false);
  }
});

test('las lluvias de asteroides ocurren cada pocos minutos (evento ~3 min o menos)', () => {
  const g = makeGame();
  g.asteroids.setEnabled(true);
  const waves = [];
  g.asteroids.onWaveStart = (target, count) => waves.push({ t: g.playTime, count });
  flyTo(g, 'earth', 40);
  // 20 minutos de juego (como la sesión del jugador en el móvil)
  runFrames(g, 20 * 60 * 60);
  assert.ok(waves.length >= 4, `en 20 min deberían haberse iniciado al menos 4 oleadas, hubo ${waves.length}`);
  // La primera oleada no debe tardar más de 3 minutos
  assert.ok(waves[0].t <= 180, `la primera oleada tardó ${Math.round(waves[0].t)} s (máx 180)`);
  // Entre oleadas: a lo sumo ~3 minutos sin evento
  for (let i = 1; i < waves.length; i++) {
    const gap = waves[i].t - waves[i - 1].t;
    assert.ok(gap <= 190, `ola ${i} llegó ${Math.round(gap)} s después de la anterior (máx ~190)`);
  }
});
