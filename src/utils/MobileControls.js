/**
 * MobileControls - Joystick virtual + botones + giroscopio
 */
export class MobileControls {
  constructor(inputSystem) {
    this.input = inputSystem;
    this.joysticks = {
      left: { active: false, x:0, y:0, base: null, stick: null },
      right: { active: false, x:0, y:0, base: null, stick: null }
    };
    this.isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.initDOM();
  }

  initDOM() {
    const container = document.getElementById('mobile-controls');
    if (!container) return;
    if (this.isMobile) container.classList.add('visible');

    ['left','right'].forEach(side => {
      const zone = document.getElementById(`joystick-${side}`);
      if (!zone) return;
      const base = zone.querySelector('.joystick-base');
      const stick = zone.querySelector('.joystick-stick');
      this.joysticks[side].base = base;
      this.joysticks[side].stick = stick;

      let startX=0, startY=0, baseRect=null;

      const onStart = (e) => {
        e.preventDefault();
        const t = e.touches ? e.touches[0] : e;
        baseRect = base.getBoundingClientRect();
        startX = baseRect.left + baseRect.width/2;
        startY = baseRect.top + baseRect.height/2;
        this.joysticks[side].active = true;
      };

      const onMove = (e) => {
        if (!this.joysticks[side].active) return;
        e.preventDefault();
        const t = e.touches ? e.touches[0] : e;
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const maxDist = 45;
        const angle = Math.atan2(dy, dx);
        const clamped = Math.min(dist, maxDist);
        const nx = Math.cos(angle) * clamped;
        const ny = Math.sin(angle) * clamped;

        stick.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
        this.joysticks[side].x = nx / maxDist;
        this.joysticks[side].y = ny / maxDist;

        if (side === 'left') {
          this.input.moveX = this.joysticks[side].x;
          this.input.moveY = -this.joysticks[side].y;
        } else {
          this.input.lookX = this.joysticks[side].x * 2.5;
          this.input.lookY = this.joysticks[side].y * 2.5;
        }
      };

      const onEnd = (e) => {
        this.joysticks[side].active = false;
        stick.style.transform = `translate(-50%, -50%)`;
        this.joysticks[side].x = 0;
        this.joysticks[side].y = 0;
        if (side === 'left') {
          this.input.moveX = 0; this.input.moveY = 0;
        } else {
          this.input.lookX = 0; this.input.lookY = 0;
        }
      };

      base.addEventListener('touchstart', onStart, {passive:false});
      base.addEventListener('touchmove', onMove, {passive:false});
      base.addEventListener('touchend', onEnd, {passive:false});
      // mouse fallback
      base.addEventListener('mousedown', onStart);
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onEnd);
    });

    // Botones acción
    document.querySelectorAll('.mob-btn').forEach(btn => {
      const action = btn.dataset.action;
      const handle = (e) => {
        e.preventDefault();
        if (action === 'shoot') this.input.shooting = true;
        if (action === 'boost') this.input.boost = true;
        if (action === 'collect') this.input.collect = true;
        if (action === 'camera') this.input.toggleCamera = true;
      };
      const handleEnd = (e) => {
        if (action === 'shoot') this.input.shooting = false;
        if (action === 'boost') this.input.boost = false;
        if (action === 'collect') this.input.collect = false;
      };
      btn.addEventListener('touchstart', handle, {passive:false});
      btn.addEventListener('touchend', handleEnd, {passive:false});
      btn.addEventListener('mousedown', handle);
      btn.addEventListener('mouseup', handleEnd);
    });
  }

  update() {
    // suavizado opcional
  }
}
