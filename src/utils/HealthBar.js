import * as THREE from 'three';

/**
 * Barra de vida 3D (dos sprites que siempre miran a la cámara).
 * Los materiales se comparten entre todas las barras: cambiar de color es
 * solo cambiar de material (sin recompilar shaders).
 */
const shared = {};
function mats() {
  if (!shared.bg) {
    const mk = (color, opacity) => new THREE.SpriteMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest: true, fog: false });
    shared.bg = mk(0x000000, 0.6);
    shared.green = mk(0x39ff7a, 0.95);
    shared.yellow = mk(0xffd000, 0.95);
    shared.red = mk(0xff3344, 0.95);
    shared.blue = mk(0x33c8ff, 0.95);
  }
  return shared;
}

export class HealthBar {
  constructor(width = 4, height = 0.4) {
    const m = mats();
    this.width = width;
    this.group = new THREE.Group();
    this.bg = new THREE.Sprite(m.bg);
    this.bg.scale.set(width + 0.25, height + 0.2, 1);
    this.fg = new THREE.Sprite(m.green);
    this.fg.center.set(0, 0.5);
    this.fg.position.x = -width / 2;
    this.fg.scale.set(width, height, 1);
    this.bg.renderOrder = 10;
    this.fg.renderOrder = 11;
    this.group.add(this.bg, this.fg);
    this._frac = 1;
  }

  set(frac, colorOverride = null) {
    frac = Math.max(0, Math.min(1, frac));
    this._frac = frac;
    const m = mats();
    this.fg.scale.x = Math.max(0.001, this.width * frac);
    this.fg.material = colorOverride ? m[colorOverride] : (frac > 0.6 ? m.green : frac > 0.3 ? m.yellow : m.red);
  }

  setVisible(v) { this.group.visible = v; }
}
