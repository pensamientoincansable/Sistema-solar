import { settings } from '../systems/Settings.js';
import { isTouchUI } from '../utils/device.js';

/**
 * Input System - Teclado + Ratón + Gamepad + Táctil unificado (PC / TV / Móvil)
 *
 * Cada fuente escribe en su propio canal y `update()` los combina en el estado
 * final de cada frame, así ninguna fuente "se queda pegada".
 *
 * Estado por frame:
 *   moveX, moveY            -1..1  (lateral / avance)
 *   up, down                bool   (Q / E, botones ▲ ▼)
 *   lookX, lookY            velocidad de giro (rad/s): joystick derecho / stick del mando
 *   lookDeltaX, lookDeltaY  giro instantáneo del ratón (rad) acumulado en el frame
 *   boost, shooting         bool
 *   actionHeld              bool   (ESPACIO / R / botón de acción / A): mantener = reparar
 * Convención (sin inversión): lookX > 0 gira a la derecha, lookY > 0 mira hacia abajo
 * (igual que arrastrar el dedo o mover el ratón hacia abajo).
 *
 * Eventos puntuales (consume*): acción, zoom (rueda), ciclo de cámara, alternar
 * cámara, cambio de arma, tienda y pausa.
 */
export class InputSystem {
  constructor(canvas) {
    this.canvas = canvas;

    // Fuentes
    this.keys = {};
    this.mouse = { x: 0, y: 0, left: false, right: false, locked: false };
    this._mouseDX = 0;
    this._mouseDY = 0;
    this.baseMouseSensitivity = 0.0025; // rad por píxel (x Ajustes)
    this.touch = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, shoot: false, boost: false, action: false, up: false, down: false };
    this.gamepadIndex = null;
    this.enabled = true;

    // Estado combinado (por frame)
    this.moveX = 0;
    this.moveY = 0;
    this.up = false;
    this.down = false;
    this.lookX = 0;
    this.lookY = 0;
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.boost = false;
    this.shooting = false;
    this.actionHeld = false;
    this.lastDevice = isTouchUI() ? 'touch' : 'keyboard';

    // Eventos puntuales
    this._cameraToggle = false;
    this._zoomCycle = false;
    this._zoomDelta = 0;
    this._weaponSwitch = 0;     // 0 nada | 1..4 arma concreta | 'next'
    this._pause = false;
    this._actionLatch = false;
    this._shopLatch = false;
    this._shootLatch = false;   // garantiza al menos un frame de disparo por click/tap
    this._prevGamepadButtons = {};
    this._ignoreMouseEvents = 0;

    this.onPointerLockLost = null;
    this.onPointerLockError = null;

    this.bindEvents();
  }

  get mouseSensitivity() {
    return this.baseMouseSensitivity * (settings.get('mouseSensitivity') || 1);
  }

  bindEvents() {
    window.addEventListener('keydown', e => {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;

      const code = (e.code || '').toLowerCase();
      const wasDown = !!this.keys[code];
      this.keys[code] = true;
      this.lastDevice = 'keyboard';

      if (['Space', 'KeyF', 'KeyC', 'KeyV', 'KeyT', 'KeyR', 'Digit1', 'Digit2', 'Digit3', 'Digit4',
        'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      if (e.repeat || wasDown) return; // solo flancos de bajada para eventos

      switch (e.code) {
        case 'Space': this._actionLatch = true; break;
        case 'KeyF': this._shootLatch = true; break;
        case 'KeyC': this._cameraToggle = true; break;
        case 'KeyV': this._zoomCycle = true; break;
        case 'KeyT': this._shopLatch = true; break;
        case 'Digit1': case 'Numpad1': this._weaponSwitch = 1; break;
        case 'Digit2': case 'Numpad2': this._weaponSwitch = 2; break;
        case 'Digit3': case 'Numpad3': this._weaponSwitch = 3; break;
        case 'Digit4': case 'Numpad4': this._weaponSwitch = 4; break;
        case 'Escape': case 'KeyP': this._pause = true; break;
        default: break;
      }
    });

    window.addEventListener('keyup', e => {
      const code = (e.code || '').toLowerCase();
      this.keys[code] = false;
    });

    // Si la ventana pierde el foco, soltar todo (evita teclas/botones pegados)
    window.addEventListener('blur', () => this.releaseAll());

    this.canvas.addEventListener('mousedown', e => {
      this.lastDevice = 'keyboard';
      if (e.button === 0) { this.mouse.left = true; this._shootLatch = true; }
      if (e.button === 2) this.mouse.right = true;
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });

    this.canvas.addEventListener('click', () => {
      if (this.mouse.locked || !this.enabled) return;
      const hud = document.getElementById('hud');
      if (hud && hud.classList.contains('visible')) this.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      const wasLocked = this.mouse.locked;
      this.mouse.locked = locked;
      // El primer mousemove tras capturar puede traer un salto enorme: se descarta
      this._ignoreMouseEvents = locked ? 2 : 0;
      this._mouseDX = 0;
      this._mouseDY = 0;
      if (wasLocked && !locked && this.onPointerLockLost) {
        try { this.onPointerLockLost(); } catch (e) { /* noop */ }
      }
    });
    document.addEventListener('pointerlockerror', () => {
      console.warn('[Input] No se pudo capturar el puntero');
      if (this.onPointerLockError) { try { this.onPointerLockError(); } catch (e) { /* noop */ } }
    });

    this.canvas.addEventListener('mousemove', e => {
      if (this.mouse.locked) {
        if (this._ignoreMouseEvents > 0) { this._ignoreMouseEvents--; return; }
        const clampPx = v => Math.max(-150, Math.min(150, v || 0));
        this._mouseDX += clampPx(e.movementX);
        this._mouseDY += clampPx(e.movementY);
      } else {
        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      }
    });

    // Rueda: acerca (arriba) / aleja (abajo) la cámara entre 3ª y 1ª persona
    this.canvas.addEventListener('wheel', e => {
      e.preventDefault();
      if (!this.enabled) return;
      let dy = e.deltaY || 0;
      if (e.deltaMode === 1) dy *= 33;       // líneas
      else if (e.deltaMode === 2) dy *= 400; // páginas
      const step = Math.max(-0.15, Math.min(0.15, dy * 0.0012));
      this._zoomDelta += step;
    }, { passive: false });

    this.canvas.addEventListener('contextmenu', e => e.preventDefault());

    window.addEventListener('gamepadconnected', e => {
      console.log('[Input] Gamepad conectado:', e.gamepad.id);
      this.gamepadIndex = e.gamepad.index;
    });
    window.addEventListener('gamepaddisconnected', e => {
      if (this.gamepadIndex === e.gamepad.index) this.gamepadIndex = null;
    });
  }

  /** Suelta todas las entradas mantenidas (pausa, tienda, pérdida de foco). */
  releaseAll() {
    this.keys = {};
    this.mouse.left = false;
    this.mouse.right = false;
    const t = this.touch;
    t.moveX = t.moveY = t.lookX = t.lookY = 0;
    t.shoot = t.boost = t.action = t.up = t.down = false;
    this._mouseDX = 0;
    this._mouseDY = 0;
    this._shootLatch = false;
  }

  /** Pide captura del puntero (debe llamarse desde un gesto de usuario). */
  requestPointerLock() {
    try {
      if (this.isTouchDevice()) return;
      if (document.pointerLockElement === this.canvas) return;
      const p = this.canvas.requestPointerLock?.({ unadjustedMovement: false });
      if (p && typeof p.catch === 'function') p.catch(() => { /* el usuario puede hacer click en el canvas */ });
    } catch (e) { /* algunos navegadores lanzan si no hay gesto */ }
  }

  exitPointerLock() {
    try { if (document.pointerLockElement) document.exitPointerLock?.(); } catch (e) { /* noop */ }
  }

  isTouchDevice() { return isTouchUI(); }

  // Peticiones desde la interfaz táctil
  requestCameraToggle() { this._cameraToggle = true; }
  requestZoomCycle() { this._zoomCycle = true; }
  requestWeaponNext() { this._weaponSwitch = 'next'; }
  requestPause() { this._pause = true; }
  requestAction() { this._actionLatch = true; }
  requestShop() { this._shopLatch = true; }
  requestShot() { this._shootLatch = true; }

  update() {
    const k = this.keys;
    const w = k['keyw'] || k['arrowup'];
    const s = k['keys'] || k['arrowdown'];
    const a = k['keya'] || k['arrowleft'];
    const d = k['keyd'] || k['arrowright'];
    const shift = k['shiftleft'] || k['shiftright'];

    // --- Teclado / ratón ---
    let moveX = (d ? 1 : 0) - (a ? 1 : 0);
    let moveY = (w ? 1 : 0) - (s ? 1 : 0);
    let up = !!k['keyq'];
    let down = !!k['keye'];
    let boost = !!shift;
    let action = !!(k['space'] || k['keyr']);
    let shooting = !!(this.mouse.left || k['keyf']);
    let lookX = 0;
    let lookY = 0;

    // --- Táctil (joysticks dinámicos y botones) ---
    const t = this.touch;
    if (Math.abs(t.moveX) > 0.01 || Math.abs(t.moveY) > 0.01) {
      moveX = t.moveX;
      moveY = t.moveY;
    }
    if (t.lookX || t.lookY) {
      lookX = t.lookX; // ya en rad/s con curva y sensibilidad (MobileControls)
      lookY = t.lookY;
    }
    boost = boost || t.boost;
    action = action || t.action;
    shooting = shooting || t.shoot;
    up = up || t.up;
    down = down || t.down;

    // --- Gamepad ---
    const gp = this._getGamepad();
    if (gp) {
      const dead = 0.18;
      const ax = i => {
        const v = gp.axes[i];
        if (v === undefined || Math.abs(v) < dead) return 0;
        return Math.sign(v) * (Math.abs(v) - dead) / (1 - dead);
      };
      const lx = ax(0), ly = -ax(1), rx = ax(2), ry = ax(3);
      if (lx || ly) { moveX = lx; moveY = ly; }
      const sens = settings.get('lookSensitivity') || 1;
      if (rx || ry) {
        lookX = Math.sign(rx) * Math.pow(Math.abs(rx), 1.6) * 2.6 * sens;
        lookY = Math.sign(ry) * Math.pow(Math.abs(ry), 1.6) * 2.2 * sens;
      }
      const btn = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
      const any = btn(0) || btn(1) || btn(2) || btn(3) || lx || ly || rx || ry;
      if (any) this.lastDevice = 'gamepad';
      boost = boost || btn(1) || btn(6);          // B / LT
      shooting = shooting || btn(7) || btn(5);    // RT / RB
      const gpAction = btn(0) || btn(2);          // A / X
      action = action || gpAction;
      up = up || btn(12);
      down = down || btn(13);
      const prev = this._prevGamepadButtons;
      if (btn(3) && !prev[3]) this._zoomCycle = true;         // Y: distancia de cámara
      if (btn(9) && !prev[9]) this._pause = true;             // Start
      if (btn(4) && !prev[4]) this._weaponSwitch = 'next';    // LB
      if (btn(8) && !prev[8]) this._shopLatch = true;         // Back/Select: tienda
      if (gpAction && !prev.action) this._actionLatch = true;
      this._prevGamepadButtons = { 3: btn(3), 9: btn(9), 4: btn(4), 8: btn(8), action: gpAction };
    }

    // --- Ratón (delta acumulado desde el último frame) ---
    const ms = this.mouseSensitivity;
    this.lookDeltaX = this._mouseDX * ms;
    this.lookDeltaY = this._mouseDY * ms;
    this._mouseDX = 0;
    this._mouseDY = 0;

    this.moveX = Math.max(-1, Math.min(1, moveX));
    this.moveY = Math.max(-1, Math.min(1, moveY));
    this.up = up;
    this.down = down;
    this.lookX = lookX;
    this.lookY = lookY;
    this.boost = boost;
    this.shooting = shooting || this._shootLatch;
    this._shootLatch = false;
    this.actionHeld = action;
  }

  _getGamepad() {
    try {
      if (!navigator.getGamepads) return null;
      const pads = navigator.getGamepads();
      if (this.gamepadIndex !== null && pads[this.gamepadIndex]) return pads[this.gamepadIndex];
      for (const p of pads) { if (p && p.connected) { this.gamepadIndex = p.index; return p; } }
    } catch (e) { /* noop */ }
    return null;
  }

  consumeCameraToggle() { const v = this._cameraToggle; this._cameraToggle = false; return v; }
  consumeZoomCycle() { const v = this._zoomCycle; this._zoomCycle = false; return v; }
  consumeZoomDelta() { const v = this._zoomDelta; this._zoomDelta = 0; return v; }
  consumeWeaponSwitch() { const v = this._weaponSwitch; this._weaponSwitch = 0; return v; }
  consumeActionPress() { const v = this._actionLatch; this._actionLatch = false; return v; }
  consumeShopRequest() { const v = this._shopLatch; this._shopLatch = false; return v; }
  consumePause() { const v = this._pause; this._pause = false; return v; }

  /** Descarta eventos pendientes (al reanudar tras menú/tienda). */
  flushEvents() {
    this._cameraToggle = this._zoomCycle = this._actionLatch = this._shopLatch = this._pause = false;
    this._zoomDelta = 0;
    this._weaponSwitch = 0;
    this._shootLatch = false;
  }
}
