/**
 * Input System - Teclado + Ratón + Gamepad + Táctil unificado (PC / TV / Móvil)
 *
 * Diseño: cada fuente de entrada escribe en su propio canal (teclado, ratón,
 * táctil, gamepad) y `update()` combina los canales en el estado final de cada
 * frame. Así ninguna fuente "se queda pegada": antes, soltar W/F/Shift no
 * detenía el movimiento, el disparo o el boost porque el estado se
 * realimentaba consigo mismo (`this.boost = shift || this.boost`).
 *
 * Estado que lee el juego cada frame:
 *   moveX, moveY          -1..1  (strafe / avance)
 *   up, down              bool   (Q / E, botones)
 *   lookX, lookY          velocidad de giro (rad/s) - joystick derecho / stick gamepad
 *   lookDeltaX, lookDeltaY giro instantáneo (rad) del ratón acumulado en este frame
 *   boost, shooting, collect  bool
 * Eventos puntuales: consumeCameraToggle(), consumeWeaponSwitch(),
 *   consumeCollectPress(), consumePause()
 */
export class InputSystem {
  constructor(canvas) {
    this.canvas = canvas;

    // Fuentes
    this.keys = {};
    this.mouse = { x: 0, y: 0, left: false, right: false, locked: false };
    this._mouseDX = 0;
    this._mouseDY = 0;
    this.mouseSensitivity = 0.0025; // rad por píxel
    this.touch = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, shoot: false, boost: false, collect: false, up: false, down: false };
    this.gamepadIndex = null;

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
    this.collect = false;

    // Eventos puntuales
    this._cameraToggleRequested = false;
    this._weaponSwitch = 0;
    this._pauseRequested = false;
    this._collectLatch = false;   // pulsación de "depositar" pendiente de consumir
    this._shootLatch = false;     // garantiza al menos un frame de disparo por click/tap
    this._prevGamepadButtons = {};
    this._ignoreMouseEvents = 0;  // eventos de ratón a descartar tras capturar el puntero

    // Callbacks opcionales
    this.onPointerLockLost = null;
    this.onPointerLockError = null;

    this.bindEvents();
  }

  bindEvents() {
    window.addEventListener('keydown', e => {
      // No interferir con controles de formulario del menú (selects, sliders)
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;

      const code = (e.code || '').toLowerCase();
      const wasDown = !!this.keys[code];
      this.keys[code] = true;

      if (['Space', 'KeyF', 'KeyC', 'Digit1', 'Digit2', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      if (e.repeat || wasDown) return; // solo flancos de bajada para eventos puntuales

      if (e.code === 'Space') this._collectLatch = true;
      if (e.code === 'KeyF') this._shootLatch = true;
      if (e.code === 'KeyC') this._cameraToggleRequested = true;
      if (e.code === 'Digit1' || e.code === 'Numpad1') this._weaponSwitch = 1;
      if (e.code === 'Digit2' || e.code === 'Numpad2') this._weaponSwitch = 2;
      if (e.code === 'Escape' || e.code === 'KeyP') this._pauseRequested = true;
    });

    window.addEventListener('keyup', e => {
      const code = (e.code || '').toLowerCase();
      this.keys[code] = false;
    });

    // Si la ventana pierde el foco, soltar todas las teclas (evita teclas pegadas)
    window.addEventListener('blur', () => {
      this.keys = {};
      this.mouse.left = false;
      this.mouse.right = false;
    });

    this.canvas.addEventListener('mousedown', e => {
      if (e.button === 0) { this.mouse.left = true; this._shootLatch = true; }
      if (e.button === 2) this.mouse.right = true;
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });

    this.canvas.addEventListener('click', () => {
      if (this.mouse.locked) return;
      // Solo capturar el ratón si el juego está en marcha (HUD visible)
      const hud = document.getElementById('hud');
      if (hud && hud.classList.contains('visible')) {
        this.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      const wasLocked = this.mouse.locked;
      this.mouse.locked = locked;
      // El primer mousemove tras capturar el puntero puede traer un salto enorme
      // (movementX/Y relativo a la posición anterior del cursor). Se descarta.
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
        // Limitar saltos anómalos (>150 px en un solo evento)
        const clampPx = v => Math.max(-150, Math.min(150, v || 0));
        this._mouseDX += clampPx(e.movementX);
        this._mouseDY += clampPx(e.movementY);
      } else {
        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      }
    });

    this.canvas.addEventListener('contextmenu', e => e.preventDefault());

    window.addEventListener('gamepadconnected', e => {
      console.log('[Input] Gamepad conectado:', e.gamepad.id);
      this.gamepadIndex = e.gamepad.index;
    });
    window.addEventListener('gamepaddisconnected', e => {
      if (this.gamepadIndex === e.gamepad.index) this.gamepadIndex = null;
    });
  }

  /** Pide captura del puntero (debe llamarse desde un gesto de usuario). */
  requestPointerLock() {
    try {
      if (this.isTouchDevice()) return;
      if (document.pointerLockElement === this.canvas) return;
      const p = this.canvas.requestPointerLock?.({ unadjustedMovement: false });
      if (p && typeof p.catch === 'function') p.catch(() => { /* ignorado: el usuario puede hacer click en el canvas */ });
    } catch (e) { /* algunos navegadores lanzan si no hay gesto */ }
  }

  exitPointerLock() {
    try { if (document.pointerLockElement) document.exitPointerLock?.(); } catch (e) { /* noop */ }
  }

  isTouchDevice() {
    try {
      return window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(hover: hover)').matches;
    } catch (e) {
      return 'ontouchstart' in window && navigator.maxTouchPoints > 0;
    }
  }

  requestCameraToggle() { this._cameraToggleRequested = true; }

  update() {
    const k = this.keys;
    const w = k['keyw'] || k['arrowup'];
    const s = k['keys'] || k['arrowdown'];
    const a = k['keya'] || k['arrowleft'];
    const d = k['keyd'] || k['arrowright'];
    const shift = k['shiftleft'] || k['shiftright'];
    const space = k['space'];

    // --- Teclado ---
    let moveX = (d ? 1 : 0) - (a ? 1 : 0);
    let moveY = (w ? 1 : 0) - (s ? 1 : 0);
    let up = !!k['keyq'];
    let down = !!k['keye'];
    let boost = !!shift;
    let collect = !!space;
    let shooting = !!(this.mouse.left || k['keyf']);
    let lookX = 0;
    let lookY = 0;

    // --- Táctil (joysticks/botones virtuales) ---
    const t = this.touch;
    if (Math.abs(t.moveX) > 0.05 || Math.abs(t.moveY) > 0.05) {
      moveX = t.moveX;
      moveY = t.moveY;
    }
    if (Math.abs(t.lookX) > 0.05 || Math.abs(t.lookY) > 0.05) {
      lookX = t.lookX * 2.5;
      lookY = t.lookY * 2.5;
    }
    boost = boost || t.boost;
    collect = collect || t.collect;
    shooting = shooting || t.shoot;
    up = up || t.up;
    down = down || t.down;
    if (t.collect && !this._prevTouchCollect) this._collectLatch = true;
    this._prevTouchCollect = !!t.collect;

    // --- Gamepad ---
    const gp = this._getGamepad();
    if (gp) {
      const dead = 0.2;
      const ax = i => (gp.axes[i] !== undefined && Math.abs(gp.axes[i]) > dead) ? gp.axes[i] : 0;
      const lx = ax(0), ly = -ax(1), rx = ax(2), ry = ax(3);
      if (lx || ly) { moveX = lx; moveY = ly; }
      if (rx || ry) { lookX = rx * 2.5; lookY = ry * 2.5; }
      const btn = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
      boost = boost || btn(1) || btn(6);          // B / LT
      shooting = shooting || btn(7) || btn(5);    // RT / RB
      collect = collect || btn(0) || btn(2);      // A / X
      up = up || btn(12);                         // D-pad arriba
      down = down || btn(13);                     // D-pad abajo
      // Botones con flanco: Y cámara, Start pausa, LB/RB cambio de arma
      if (btn(3) && !this._prevGamepadButtons[3]) this._cameraToggleRequested = true;
      if (btn(9) && !this._prevGamepadButtons[9]) this._pauseRequested = true;
      if (btn(4) && !this._prevGamepadButtons[4]) this._weaponSwitch = this._weaponSwitch || 2;
      const gpCollect = btn(0) || btn(2);
      if (gpCollect && !this._prevGamepadButtons.collect) this._collectLatch = true;
      this._prevGamepadButtons = { 3: btn(3), 9: btn(9), 4: btn(4), collect: gpCollect };
    }

    // --- Ratón (delta acumulado desde el último frame) ---
    this.lookDeltaX = this._mouseDX * this.mouseSensitivity;
    this.lookDeltaY = this._mouseDY * this.mouseSensitivity;
    this._mouseDX = 0;
    this._mouseDY = 0;

    // Estado final
    this.moveX = Math.max(-1, Math.min(1, moveX));
    this.moveY = Math.max(-1, Math.min(1, moveY));
    this.up = up;
    this.down = down;
    this.lookX = lookX;
    this.lookY = lookY;
    this.boost = boost;
    this.shooting = shooting || this._shootLatch;
    this._shootLatch = false;
    this.collect = collect;
  }

  _getGamepad() {
    try {
      if (!navigator.getGamepads) return null;
      const pads = navigator.getGamepads();
      if (this.gamepadIndex !== null && pads[this.gamepadIndex]) return pads[this.gamepadIndex];
      // Autodetección si el evento gamepadconnected no llegó
      for (const p of pads) { if (p && p.connected) { this.gamepadIndex = p.index; return p; } }
    } catch (e) { /* noop */ }
    return null;
  }

  consumeCameraToggle() {
    if (this._cameraToggleRequested) { this._cameraToggleRequested = false; return true; }
    return false;
  }

  consumeWeaponSwitch() {
    const w = this._weaponSwitch;
    this._weaponSwitch = 0;
    return w;
  }

  /** True una sola vez por pulsación de ESPACIO / botón 📦 / A del mando. */
  consumeCollectPress() {
    const p = this._collectLatch;
    this._collectLatch = false;
    return p;
  }

  consumePause() {
    if (this._pauseRequested) { this._pauseRequested = false; return true; }
    return false;
  }
}
