/**
 * WALL·E: chorro verde del turbo (3 tonos) y visión cinemática que restaura
 * el ángulo original al desactivarse.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './helpers/dom.js';

installDom();

const THREE = await import('three');
const { WallE, BOOST_GREENS, BOOST_GREEN_NAMES } = await import('../src/entities/WallE.js');

function makeWalle() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1000);
  const orig = WallE.prototype.loadModel;
  WallE.prototype.loadModel = function loadModelStub() { this.loaded = false; };
  const w = new WallE(scene, camera);
  WallE.prototype.loadModel = orig;
  return { w, scene, camera };
}

function lightness(color) {
  // Luma percibida: el tono "más claro" debe tener más luma
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

test('el turbo tiene exactamente 3 tonos de verde, cada uno más claro que el anterior', () => {
  assert.equal(BOOST_GREENS.length, 3);
  assert.equal(BOOST_GREEN_NAMES.length, 3);
  const l0 = lightness(BOOST_GREENS[0]);
  const l1 = lightness(BOOST_GREENS[1]);
  const l2 = lightness(BOOST_GREENS[2]);
  assert.ok(l1 > l0, `tono 2 (${l1.toFixed(3)}) debe ser más claro que tono 1 (${l0.toFixed(3)})`);
  assert.ok(l2 > l1, `tono 3 (${l2.toFixed(3)}) debe ser más claro que tono 2 (${l1.toFixed(3)})`);
  // Todos son verdosos: G es el canal dominante
  for (const c of BOOST_GREENS) {
    assert.ok(c.g > c.r && c.g > c.b, 'el chorro del turbo debe ser verde');
  }
});

test('sin turbo el tono es -1; con turbo hay 3 umbrales de velocidad', () => {
  const { w } = makeWalle();
  assert.equal(w._updateThrusterColor(0.1, false), -1);
  assert.equal(w.thrusterTone, -1);
  assert.equal(w._updateThrusterColor(0.2, true), 0);
  assert.equal(w.thrusterTone, 0);
  assert.equal(w._updateThrusterColor(0.6, true), 1);
  assert.equal(w.thrusterTone, 1);
  assert.equal(w._updateThrusterColor(0.95, true), 2);
  assert.equal(w.thrusterTone, 2);
});

test('el material del chorro arranca en verde (no cian)', () => {
  const { w } = makeWalle();
  assert.ok(w.thrusterParticles, 'debe haber partículas del propulsor');
  const c = w.thrusterParticles.points.material.color;
  assert.ok(c.g > c.b, `el chorro debe ser verdoso, no cian (rgb ${c.r.toFixed(2)},${c.g.toFixed(2)},${c.b.toFixed(2)})`);
  assert.ok(w.thrusterLight, 'debe haber luz del propulsor');
  const lc = w.thrusterLight.color;
  assert.ok(lc.g > lc.b, 'la luz del propulsor también es verde');
});

test('activar la visión cinemática guarda el ángulo y al salir lo restaura exactamente', () => {
  const { w } = makeWalle();
  w.rotation.y = 1.23;
  w.rotation.x = 0.31;
  w.zoomTarget = 0.62;
  w.quaternion.setFromEuler(w.rotation);
  w.group.quaternion.copy(w.quaternion);
  w.snapCamera();

  const saved = { y: w.rotation.y, x: w.rotation.x, z: w.zoomTarget };
  assert.equal(w.startCinematic(), true);
  assert.equal(w.cinematic.active, true);
  assert.equal(w.cinematic.savedYaw, saved.y);
  assert.equal(w.cinematic.savedPitch, saved.x);
  assert.equal(w.cinematic.savedZoom, saved.z);
  assert.equal(w.startCinematic(), false, 'no se puede activar dos veces');

  const idle = { lookX: 0, lookY: 0, lookDeltaX: 0, lookDeltaY: 0, moveX: 0, moveY: 0, up: false, down: false, boost: false };
  const cam0 = w.camera.position.clone();
  for (let i = 0; i < 40; i++) w.update(0.05, idle, null);   // 2 s de órbita
  assert.equal(w.cinematic.active, true);
  const moved = w.camera.position.distanceTo(cam0);
  assert.ok(moved > 0.5, `la cámara debe orbitar (se movió ${moved.toFixed(2)} u)`);

  assert.equal(w.stopCinematic(), true);
  assert.equal(w.cinematic.active, false);
  assert.ok(w.cinematic.restore > 0, 'la vuelta al ángulo original es suave');

  // Durante la restauración el ratón NO debe alterar el ángulo guardado.
  const noisy = { ...idle, lookDeltaX: 0.8, lookDeltaY: 0.4 };
  let guard = 0;
  while (w.cinematic.restore > 0 && guard++ < 40) w.update(0.05, noisy, null);
  assert.equal(w.cinematic.restore, 0);
  assert.ok(Math.abs(w.rotation.y - saved.y) < 1e-9, `yaw restaurado (${w.rotation.y} vs ${saved.y})`);
  assert.ok(Math.abs(w.rotation.x - saved.x) < 1e-9, `pitch restaurado (${w.rotation.x} vs ${saved.x})`);
  assert.equal(w.zoomTarget, saved.z);
  assert.equal(w.zoom, saved.z);
});

test('toggleCinematic activa y desactiva con el mismo método', () => {
  const { w } = makeWalle();
  assert.equal(w.toggleCinematic(), 'on');
  assert.equal(w.cinematic.active, true);
  assert.equal(w.toggleCinematic(), 'off');
  assert.equal(w.cinematic.active, false);
});

test('la cámara da una vuelta completa (360º) alrededor de WALL·E', () => {
  const { w } = makeWalle();
  w.startCinematic();
  const period = (Math.PI * 2) / w.cinematic.spin;   // segundos por vuelta
  const idle = { lookX: 0, lookY: 0, lookDeltaX: 0, lookDeltaY: 0, moveX: 0, moveY: 0, up: false, down: false, boost: false };
  w.update(0.016, idle, null);
  const start = w.cinematic.angle;
  w.update(period, idle, null);
  const delta = Math.abs((w.cinematic.angle - start) - Math.PI * 2);
  assert.ok(delta < 0.05, `una vuelta debe ser 2π radianes (error ${delta.toFixed(4)})`);
});
