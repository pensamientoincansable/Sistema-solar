/**
 * Input System - Teclado + Ratón + Gamepad + Táctil unificado
 * Soporte PC / TV / Móvil
 */
export class InputSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = {};
    this.mouse = { x:0, y:0, deltaX:0, deltaY:0, left:false, right:false, locked:false };
    this.moveX = 0;
    this.moveY = 0;
    this.lookX = 0;
    this.lookY = 0;
    this.shooting = false;
    this.boost = false;
    this.collect = false;
    this.toggleCamera = false;
    this._toggleCameraConsumed = true;
    this.weaponSwitch = 0;
    this.gamepadIndex = null;

    this.bindEvents();
  }

  bindEvents() {
    window.addEventListener('keydown', e => {
      this.keys[e.code.toLowerCase()] = true;
      if (['Space','KeyF','KeyC','Digit1','Digit2'].includes(e.code)) e.preventDefault();
      if (e.code === 'KeyC') {
        this.toggleCamera = true;
        this._toggleCameraConsumed = false;
      }
      if (e.code === 'Digit1') this.weaponSwitch = 1;
      if (e.code === 'Digit2') this.weaponSwitch = 2;
    });
    window.addEventListener('keyup', e => {
      this.keys[e.code.toLowerCase()] = false;
      if (e.code === 'Space') this.collect = false;
    });

    this.canvas.addEventListener('mousedown', e => {
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) this.mouse.right = true;
      if (!this.mouse.locked && document.pointerLockElement !== this.canvas) {
        // No auto lock, user can click to lock in game
      }
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) { this.mouse.left = false; this.shooting = false; }
      if (e.button === 2) this.mouse.right = false;
    });

    this.canvas.addEventListener('click', () => {
      if (this.mouse.locked) return;
      // Only lock if game started
      const hud = document.getElementById('hud');
      if (hud && hud.classList.contains('visible')) {
        this.canvas.requestPointerLock?.();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.mouse.locked = document.pointerLockElement === this.canvas;
    });

    this.canvas.addEventListener('mousemove', e => {
      if (this.mouse.locked) {
        this.mouse.deltaX = e.movementX || 0;
        this.mouse.deltaY = e.movementY || 0;
        this.lookX = this.mouse.deltaX * 0.002;
        this.lookY = this.mouse.deltaY * 0.002;
      } else {
        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      }
    });

    this.canvas.addEventListener('contextmenu', e => e.preventDefault());

    // Gamepad polling handled in update
    window.addEventListener('gamepadconnected', e => {
      console.log('[Input] Gamepad conectado:', e.gamepad.id);
      this.gamepadIndex = e.gamepad.index;
    });
  }

  update() {
    // Teclado WASD -> move
    const w = this.keys['keyw'] || this.keys['arrowup'];
    const s = this.keys['keys'] || this.keys['arrowdown'];
    const a = this.keys['keya'] || this.keys['arrowleft'];
    const d = this.keys['keyd'] || this.keys['arrowright'];
    const shift = this.keys['shiftleft'] || this.keys['shiftright'];
    const space = this.keys['space'];

    // Solo sobrescribir si no hay joystick activo
    if (Math.abs(this.moveX) < 0.1 && Math.abs(this.moveY) < 0.1) {
      this.moveX = (d ? 1 : 0) - (a ? 1 : 0);
      this.moveY = (w ? 1 : 0) - (s ? 1 : 0);
    }

    this.boost = shift || this.boost;
    this.collect = space || this.collect;
    this.shooting = this.mouse.left || this.keys['keyf'] || this.shooting;

    // Gamepad
    const gp = this.gamepadIndex !== null ? navigator.getGamepads()[this.gamepadIndex] : null;
    if (gp) {
      const dead = 0.2;
      const lx = Math.abs(gp.axes[0]) > dead ? gp.axes[0] : 0;
      const ly = Math.abs(gp.axes[1]) > dead ? -gp.axes[1] : 0;
      const rx = Math.abs(gp.axes[2]) > dead ? gp.axes[2] : 0;
      const ry = Math.abs(gp.axes[3]) > dead ? gp.axes[3] : 0;
      if (Math.abs(lx) > 0 || Math.abs(ly) > 0) {
        this.moveX = lx;
        this.moveY = ly;
      }
      if (Math.abs(rx) > 0 || Math.abs(ry) > 0) {
        this.lookX = rx * 0.05;
        this.lookY = ry * 0.05;
      }
      this.boost = gp.buttons[0]?.pressed || this.boost;
      this.shooting = gp.buttons[7]?.pressed || gp.buttons[5]?.pressed || this.shooting;
      this.collect = gp.buttons[2]?.pressed || this.collect;
      if (gp.buttons[3]?.pressed && this._toggleCameraConsumed) {
        this.toggleCamera = true;
        this._toggleCameraConsumed = false;
      }
    }

    // Decay look if not locked
    if (!this.mouse.locked && Math.abs(this.lookX) < 0.001) {
      this.lookX *= 0.9;
      this.lookY *= 0.9;
    }

    // Reset delta
    this.mouse.deltaX *= 0.8;
    this.mouse.deltaY *= 0.8;
  }

  consumeCameraToggle() {
    if (this.toggleCamera && !this._toggleCameraConsumed) {
      this._toggleCameraConsumed = true;
      this.toggleCamera = false;
      return true;
    }
    if (this.toggleCamera) this.toggleCamera = false;
    return false;
  }

  consumeWeaponSwitch() {
    const w = this.weaponSwitch;
    this.weaponSwitch = 0;
    return w;
  }
}
