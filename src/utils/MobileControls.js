import { settings } from '../systems/Settings.js';
import { isTouchUI, vibrate } from './device.js';

/**
 * MobileControls - Controles táctiles.
 *
 * - Joysticks DINÁMICOS: aparecen donde se apoya el dedo y lo siguen si se
 *   sale del aro. Mitad izquierda de la pantalla = mover, mitad derecha =
 *   cámara. Sin inversión de ejes: arrastrar a la derecha gira a la derecha,
 *   arrastrar hacia arriba mira hacia arriba.
 * - Sensibilidad de cámara y tamaño de los controles configurables en Ajustes.
 * - Botones con captura de puntero (multitáctil real: se puede mover, apuntar
 *   y disparar a la vez) y vibración háptica corta en Android.
 */
const BASE_RADIUS = 66;   // px (diámetro 132) x escala de controles
const KNOB_RADIUS = 28;
const DEADZONE = 0.12;

export const ICONS = {
  shoot: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="13" fill="none" stroke="currentColor" stroke-width="3.5"/><circle cx="24" cy="24" r="4" fill="currentColor"/><path d="M24 3v9M24 36v9M3 24h9M36 24h9" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/></svg>',
  boost: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 30l14-14 14 14" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 40l14-14 14 14" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/><path d="M10 20L24 6l14 14" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" opacity=".3"/></svg>',
  weapon: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 18h26l-6-6M40 30H14l6 6" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  up: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 30l12-12 12 12" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  down: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 18l12 12 12-12" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  eye: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M3 24c5-9 12-14 21-14s16 5 21 14c-5 9-12 14-21 14S8 33 3 24z" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/><circle cx="24" cy="24" r="7" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="12" y="10" width="8" height="28" rx="2" fill="currentColor"/><rect x="28" y="10" width="8" height="28" rx="2" fill="currentColor"/></svg>',
  deposit: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 20l16-9 16 9v16l-16 9-16-9z" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/><path d="M24 4v16m-6-6l6 6 6-6" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  repair: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M30 6a10 10 0 00-9 14L7 34a4 4 0 006 6l14-14a10 10 0 0013-12l-6 6-6-2-2-6z" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/></svg>',
  shop: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M5 8h6l5 22h22l5-15H14" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="19" cy="38" r="3.5" fill="currentColor"/><circle cx="35" cy="38" r="3.5" fill="currentColor"/></svg>',
  cinematic: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="4" y="12" width="40" height="24" rx="3" fill="none" stroke="currentColor" stroke-width="3.2"/><path d="M4 20h40M14 12v8M24 12v8M34 12v8" stroke="currentColor" stroke-width="2.6" opacity=".75"/></svg>',
  fullscreen: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 18V8h10M40 18V8H30M8 30v10h10M40 30v10H30" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  civilize: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="16" fill="none" stroke="currentColor" stroke-width="3.2"/><path d="M8 24h32M24 8c5 5 5 27 0 32M24 8c-5 5-5 27 0 32" fill="none" stroke="currentColor" stroke-width="2.6" opacity=".8"/></svg>',
  hand: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M16 26V11a3 3 0 016 0v11-15a3 3 0 016 0v15-12a3 3 0 016 0v14-8a3 3 0 016 0v13c0 9-6 16-15 16h-2c-5 0-8-2-11-6l-7-9a3 3 0 015-4z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>',
};

/** Rellena los <span class="mob-icon" data-icon="…"> con su SVG. */
export function injectIcons(root = document) {
  root.querySelectorAll('.mob-icon[data-icon]').forEach((el) => {
    const svg = ICONS[el.dataset.icon];
    if (svg && !el.firstChild) el.innerHTML = svg;
  });
}

export class MobileControls {
  constructor(inputSystem) {
    this.input = inputSystem;
    this.container = document.getElementById('mobile-controls');
    this.zone = document.getElementById('touch-zone');
    this.isMobile = isTouchUI();
    this.enabled = false;
    this.sticks = {
      move: { el: null, knob: null, hint: null, pointerId: null, baseX: 0, baseY: 0, active: false },
      look: { el: null, knob: null, hint: null, pointerId: null, baseX: 0, baseY: 0, active: false },
    };
    this.onZoomCycle = null;
    this.onWeaponNext = null;
    this.onAction = null;
    this.onStickUsed = null; // (side) => {} - para el tutorial

    if (!this.container || !this.zone) {
      console.warn('[MobileControls] Falta el DOM de controles táctiles');
      return;
    }
    this.initDOM();
    this.applyScale();
    settings.onChange((key) => { if (key === 'controlScale') this.applyScale(); });
    if (this.isMobile) document.body.classList.add('touch-ui');
  }

  get scale() { return settings.get('controlScale') || 1; }

  applyScale() {
    const s = this.scale;
    document.documentElement.style.setProperty('--ctl-scale', String(s));
  }

  setVisible(visible) {
    if (!this.container) return;
    this.enabled = !!visible && this.isMobile;
    this.container.classList.toggle('visible', this.enabled);
    if (!this.enabled) this.releaseAll();
  }

  initDOM() {
    this.sticks.move.el = document.getElementById('joy-move');
    this.sticks.look.el = document.getElementById('joy-look');
    this.sticks.move.hint = document.getElementById('joy-hint-left');
    this.sticks.look.hint = document.getElementById('joy-hint-right');
    for (const s of Object.values(this.sticks)) {
      if (s.el) s.knob = s.el.querySelector('.dyn-knob');
    }

    // --- Zona de joysticks dinámicos (pantalla completa, bajo los botones) ---
    const zone = this.zone;
    zone.addEventListener('pointerdown', (e) => this._onZoneDown(e));
    zone.addEventListener('pointermove', (e) => this._onZoneMove(e));
    const end = (e) => this._onZoneUp(e);
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);
    zone.addEventListener('contextmenu', (e) => e.preventDefault());

    // --- Botones ---
    this.container.querySelectorAll('.mob-btn[data-action]').forEach((btn) => this._bindButton(btn));
    document.querySelectorAll('.hud-touch-btn[data-action]').forEach((btn) => this._bindButton(btn));

    // Evitar zoom con doble toque / gestos del navegador sobre los controles
    this.container.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    this.container.addEventListener('touchmove', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  }

  _bindButton(btn) {
    const action = btn.dataset.action;
    let pointerId = null;
    const press = (e) => {
      if (pointerId !== null) return;
      e.preventDefault();
      e.stopPropagation();
      pointerId = e.pointerId;
      try { btn.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
      btn.classList.add('pressed');
      if (settings.get('vibration')) vibrate(10);
      this._setAction(action, true);
    };
    const release = (e) => {
      if (pointerId === null || (e && e.pointerId !== undefined && e.pointerId !== pointerId)) return;
      pointerId = null;
      btn.classList.remove('pressed');
      this._setAction(action, false);
    };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('lostpointercapture', release);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn._release = () => { pointerId = null; btn.classList.remove('pressed'); this._setAction(action, false); };
  }

  _setAction(action, pressed) {
    const t = this.input.touch;
    switch (action) {
      case 'shoot':
        t.shoot = pressed;
        if (pressed) this.input.requestShot();
        break;
      case 'boost': t.boost = pressed; break;
      case 'up': t.up = pressed; break;
      case 'down': t.down = pressed; break;
      case 'action':
        t.action = pressed;
        if (pressed) { this.input.requestAction(); if (this.onAction) this.onAction(); }
        break;
      case 'weapon':
        if (pressed) { this.input.requestWeaponNext(); if (this.onWeaponNext) this.onWeaponNext(); }
        break;
      case 'zoom':
        if (pressed) { this.input.requestZoomCycle(); if (this.onZoomCycle) this.onZoomCycle(); }
        break;
      case 'pause':
        if (pressed) this.input.requestPause();
        break;
      case 'cinematic':
        // Mismo botón para activar y desactivar la visión cinemática
        if (pressed) this.input.requestCinematic();
        break;
      case 'fullscreen':
        if (pressed) this.input.requestFullscreen();
        break;
      case 'civilize':
        // Se MANTIENE pulsado para aterrizar / volver a volar
        t.civilize = pressed;
        break;
      default: break;
    }
  }

  _onZoneDown(e) {
    if (!this.enabled) return;
    const side = e.clientX < window.innerWidth / 2 ? 'move' : 'look';
    const s = this.sticks[side];
    if (s.active) return;
    e.preventDefault();
    const R = BASE_RADIUS * this.scale;
    const margin = R + 6;
    s.baseX = Math.min(window.innerWidth - margin, Math.max(margin, e.clientX));
    s.baseY = Math.min(window.innerHeight - margin, Math.max(margin, e.clientY));
    s.pointerId = e.pointerId;
    s.active = true;
    try { this.zone.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    if (s.el) {
      s.el.style.transform = `translate3d(${s.baseX - R}px, ${s.baseY - R}px, 0)`;
      s.el.classList.add('active');
    }
    if (s.hint) s.hint.classList.add('hidden');
    this._updateStick(side, e.clientX, e.clientY);
  }

  _onZoneMove(e) {
    for (const side of ['move', 'look']) {
      const s = this.sticks[side];
      if (s.active && s.pointerId === e.pointerId) {
        e.preventDefault();
        this._updateStick(side, e.clientX, e.clientY);
      }
    }
  }

  _onZoneUp(e) {
    for (const side of ['move', 'look']) {
      const s = this.sticks[side];
      if (s.active && s.pointerId === e.pointerId) this._releaseStick(side);
    }
  }

  _updateStick(side, x, y) {
    const s = this.sticks[side];
    const R = BASE_RADIUS * this.scale;
    let dx = x - s.baseX;
    let dy = y - s.baseY;
    let dist = Math.hypot(dx, dy);
    // Joystick flotante: si el dedo sale del aro, la base lo sigue
    if (dist > R) {
      const k = (dist - R) / dist;
      s.baseX += dx * k;
      s.baseY += dy * k;
      dx = x - s.baseX;
      dy = y - s.baseY;
      dist = R;
      if (s.el) s.el.style.transform = `translate3d(${s.baseX - R}px, ${s.baseY - R}px, 0)`;
    }
    if (s.knob) {
      const kx = dx * ((R - KNOB_RADIUS * this.scale * 0.35) / R);
      const ky = dy * ((R - KNOB_RADIUS * this.scale * 0.35) / R);
      s.knob.style.transform = `translate3d(${kx}px, ${ky}px, 0)`;
    }
    const nx = dx / R;
    const ny = dy / R;
    const mag = Math.min(1, Math.hypot(nx, ny));
    let out = 0;
    if (mag > DEADZONE) out = (mag - DEADZONE) / (1 - DEADZONE);
    const ux = mag > 0 ? nx / mag : 0;
    const uy = mag > 0 ? ny / mag : 0;
    const t = this.input.touch;
    if (side === 'move') {
      t.moveX = ux * out;
      t.moveY = -uy * out;     // arriba = avanzar
    } else {
      // Curva de respuesta: precisión cerca del centro, giro rápido en el borde
      const sens = settings.get('lookSensitivity') || 1;
      const rate = Math.pow(out, 1.6) * 2.6 * sens;
      t.lookX = ux * rate;          // derecha = girar a la derecha
      t.lookY = uy * rate * 0.8;    // abajo = mirar abajo (sin inversión)
    }
    if (out > 0.25 && this.onStickUsed) this.onStickUsed(side, out);
  }

  _releaseStick(side) {
    const s = this.sticks[side];
    s.active = false;
    s.pointerId = null;
    if (s.el) s.el.classList.remove('active');
    if (s.knob) s.knob.style.transform = 'translate3d(0,0,0)';
    if (s.hint) s.hint.classList.remove('hidden');
    const t = this.input.touch;
    if (side === 'move') { t.moveX = 0; t.moveY = 0; } else { t.lookX = 0; t.lookY = 0; }
  }

  releaseAll() {
    this._releaseStick('move');
    this._releaseStick('look');
    if (this.container) {
      this.container.querySelectorAll('.mob-btn').forEach((b) => b._release && b._release());
    }
    document.querySelectorAll('.hud-touch-btn').forEach((b) => b._release && b._release());
  }

  /** Actualiza el botón de acción contextual (icono + etiqueta). */
  setActionContext(ctx) {
    const btn = this.container && this.container.querySelector('.mob-action');
    if (!btn) return;
    const key = ctx ? ctx.type : 'none';
    if (btn._ctx === key) return;
    btn._ctx = key;
    const map = {
      shop: ['shop', 'TIENDA'],
      repair: ['repair', 'REPARAR'],
      deposit: ['deposit', 'DEPOSITAR'],
      none: ['hand', 'ACCIÓN'],
    };
    const [icon, label] = map[key] || map.none;
    const iconEl = btn.querySelector('.mob-icon');
    const labelEl = btn.querySelector('.mob-label');
    if (iconEl) iconEl.innerHTML = ICONS[icon];
    if (labelEl) labelEl.textContent = label;
    btn.classList.toggle('dim', key === 'none');
    btn.dataset.context = key;
  }

  setWeaponLabel(text) {
    const el = this.container && this.container.querySelector('.mob-weapon .mob-label');
    if (el && el.textContent !== text) el.textContent = text;
  }

  update() { /* los eventos de puntero actualizan el estado directamente */ }
}
