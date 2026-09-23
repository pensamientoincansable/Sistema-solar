/**
 * MobileControls - Joystick virtual dual + botones de acción.
 * Escribe en `input.touch` (canal táctil), que InputSystem combina cada frame.
 */
export class MobileControls {
  constructor(inputSystem) {
    this.input = inputSystem;
    this.joysticks = {
      left: { active: false, pointerId: null, x: 0, y: 0, base: null, stick: null },
      right: { active: false, pointerId: null, x: 0, y: 0, base: null, stick: null }
    };
    this.isMobile = MobileControls.detectTouchUI();
    try { this.initDOM(); } catch (e) { console.error('[MobileControls] initDOM error:', e); }
  }

  static detectTouchUI() {
    if (typeof window === 'undefined') return false;
    try {
      const coarse = window.matchMedia('(pointer: coarse)').matches;
      const hover = window.matchMedia('(hover: hover)').matches;
      const hasTouch = 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0;
      // Móvil/tablet: puntero principal grueso sin hover. Portátiles táctiles no cuentan.
      return (coarse && !hover) || (hasTouch && Math.min(window.innerWidth, window.innerHeight) <= 820 && coarse);
    } catch (e) {
      return 'ontouchstart' in window && (navigator.maxTouchPoints || 0) > 0;
    }
  }

  setVisible(visible) {
    const container = document.getElementById('mobile-controls');
    if (!container) return;
    container.classList.toggle('visible', !!visible);
  }

  initDOM() {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('mobile-controls');
    if (!container) return;
    if (this.isMobile) container.classList.add('visible');

    ['left', 'right'].forEach(side => {
      const zone = document.getElementById(`joystick-${side}`);
      if (!zone) return;
      const base = zone.querySelector('.joystick-base');
      const stick = zone.querySelector('.joystick-stick');
      if (!base || !stick) return;
      const js = this.joysticks[side];
      js.base = base;
      js.stick = stick;

      let centerX = 0, centerY = 0;
      const maxDist = 45;

      const apply = (nx, ny) => {
        stick.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
        js.x = nx / maxDist;
        js.y = ny / maxDist;
        if (side === 'left') {
          this.input.touch.moveX = js.x;
          this.input.touch.moveY = -js.y;
        } else {
          this.input.touch.lookX = js.x;
          this.input.touch.lookY = js.y;
        }
      };

      const onStart = (e) => {
        try {
          if (js.active) return;
          e.preventDefault();
          const rect = base.getBoundingClientRect();
          centerX = rect.left + rect.width / 2;
          centerY = rect.top + rect.height / 2;
          js.active = true;
          js.pointerId = e.pointerId;
          try { base.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
          onMove(e);
        } catch (err) { /* noop */ }
      };

      const onMove = (e) => {
        if (!js.active || e.pointerId !== js.pointerId) return;
        try {
          e.preventDefault();
          const dx = e.clientX - centerX;
          const dy = e.clientY - centerY;
          const dist = Math.hypot(dx, dy);
          const clamped = Math.min(dist, maxDist);
          const angle = Math.atan2(dy, dx);
          apply(Math.cos(angle) * clamped, Math.sin(angle) * clamped);
        } catch (err) { /* noop */ }
      };

      const onEnd = (e) => {
        if (!js.active || (e && e.pointerId !== undefined && e.pointerId !== js.pointerId)) return;
        try {
          js.active = false;
          js.pointerId = null;
          stick.style.transform = 'translate(-50%, -50%)';
          js.x = 0; js.y = 0;
          if (side === 'left') {
            this.input.touch.moveX = 0; this.input.touch.moveY = 0;
          } else {
            this.input.touch.lookX = 0; this.input.touch.lookY = 0;
          }
        } catch (err) { /* noop */ }
      };

      // Pointer Events unifica táctil y ratón; setPointerCapture permite arrastrar fuera de la base
      base.addEventListener('pointerdown', onStart);
      base.addEventListener('pointermove', onMove);
      base.addEventListener('pointerup', onEnd);
      base.addEventListener('pointercancel', onEnd);
      base.addEventListener('lostpointercapture', onEnd);
      base.style.touchAction = 'none';
    });

    // Botones acción
    document.querySelectorAll('.mob-btn').forEach(btn => {
      try {
        const action = btn.dataset.action;
        btn.style.touchAction = 'none';
        const press = (e) => {
          try {
            e.preventDefault();
            if (action === 'shoot') this.input.touch.shoot = true;
            if (action === 'boost') this.input.touch.boost = true;
            if (action === 'collect') this.input.touch.collect = true;
            if (action === 'up') this.input.touch.up = true;
            if (action === 'down') this.input.touch.down = true;
            if (action === 'camera') this.input.requestCameraToggle();
          } catch (err) { /* noop */ }
        };
        const release = () => {
          try {
            if (action === 'shoot') this.input.touch.shoot = false;
            if (action === 'boost') this.input.touch.boost = false;
            if (action === 'collect') this.input.touch.collect = false;
            if (action === 'up') this.input.touch.up = false;
            if (action === 'down') this.input.touch.down = false;
          } catch (err) { /* noop */ }
        };
        btn.addEventListener('pointerdown', press);
        btn.addEventListener('pointerup', release);
        btn.addEventListener('pointercancel', release);
        btn.addEventListener('pointerleave', release);
        btn.addEventListener('contextmenu', e => e.preventDefault());
      } catch (e) { /* skip btn */ }
    });
  }

  update() {
    // Sin suavizado adicional por ahora
  }
}
