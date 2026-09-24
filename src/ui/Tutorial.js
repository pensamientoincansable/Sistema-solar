import { settings } from '../systems/Settings.js';

/**
 * Tutorial - Guía breve e interactiva al empezar la partida.
 *
 * Cada paso ilumina el control real (foco + aro pulsante + flecha) y explica
 * su acción. Los pasos de "mover" y "cámara" avanzan solos cuando el jugador
 * lo hace. No bloquea los controles: el velo oscuro no captura toques.
 */
export const TOUCH_STEPS = [
  {
    title: 'Mover a WALL·E',
    text: 'Apoya el pulgar en cualquier punto de la MITAD IZQUIERDA de la pantalla: aparecerá un joystick justo ahí. Deslízalo para moverte (arriba = avanzar). Suelta y desaparece.',
    targets: ['#joy-hint-left'],
    auto: 'move',
    task: 'Prueba a moverte',
  },
  {
    title: 'Girar la cámara y apuntar',
    text: 'En la MITAD DERECHA aparece el joystick de cámara. Arrastra a la derecha para girar a la derecha y hacia arriba para mirar arriba. Puedes cambiar la sensibilidad en ⚙️ Ajustes.',
    targets: ['#joy-hint-right'],
    auto: 'look',
    task: 'Prueba a mirar alrededor',
  },
  {
    title: 'Disparar y cambiar de arma',
    text: 'Mantén pulsado el botón de la DIANA para disparar a OVNIs y asteroides (apunta con el centro de la pantalla; hay ayuda al apuntar). El botón de FLECHAS cambia de arma: el plasma rompe la basura en trozos.',
    targets: ['.mob-shoot', '.mob-weapon'],
  },
  {
    title: 'Turbo, subir y bajar',
    text: 'Mantén TURBO para volar más rápido. Los botones ▲ ▼ del borde izquierdo te suben y bajan (también puedes mirar arriba o abajo y avanzar).',
    targets: ['.mob-boost', '.mob-up'],
  },
  {
    title: 'Botón de ACCIÓN',
    text: 'La basura y el agua cercanas se recogen solas. Este botón cambia según dónde estés: DEPOSITAR en una refinería, REPARAR una refinería dañada (mantenlo pulsado) o abrir la TIENDA del taxi.',
    targets: ['.mob-action'],
  },
  {
    title: 'Distancia de la cámara',
    text: 'El botón del OJO alterna entre 4 distancias: de la vista en tercera persona hasta ver con los ojos de WALL·E (primera persona).',
    targets: ['#btn-zoom'],
  },
  {
    title: 'Pausa, mapa y objetivo',
    text: 'Con PAUSA abres el menú, los ajustes y las civilizaciones. En el minimapa: refinerías ◆, taxi-mercader ▬ amarillo, OVNIs rojos y asteroides naranjas. ¡Recoge basura y 💧 agua (abunda cerca de la Tierra), defiende las refinerías y construye civilizaciones!',
    targets: ['#btn-pause', '.mini-map'],
    finalLabel: '¡A jugar!',
  },
];

export const DESKTOP_STEPS = [
  {
    title: 'Moverse',
    text: 'W A S D para moverte, el RATÓN para mirar y apuntar (haz clic en la pantalla para capturarlo). Q / E suben y bajan y SHIFT activa el turbo.',
    targets: ['#crosshair'],
    auto: 'move',
    task: 'Prueba a moverte',
  },
  {
    title: 'Disparar',
    text: 'CLIC o F para disparar. Teclas 1-4 para elegir arma: el dispersor y los misiles se compran en el taxi-mercader.',
    targets: ['#hud-weapon-bar'],
  },
  {
    title: 'Acción y tienda',
    text: 'ESPACIO deposita la basura en una refinería o abre la tienda del taxi cuando estás cerca. Mantén ESPACIO (o R) junto a una refinería dañada para repararla. T abre la tienda si el taxi está a tu lado.',
    targets: ['.hud-status'],
  },
  {
    title: 'Cámara',
    text: 'La RUEDA del ratón acerca o aleja la cámara: desde la tercera persona hasta la primera. V recorre 4 distancias fijas y C alterna 1ª/3ª persona.',
    targets: ['#crosshair'],
  },
  {
    title: 'Objetivo',
    text: 'Recoge basura y 💧 agua (abunda cerca de la Tierra), deposítala en las refinerías ◆, defiéndelas de los asteroides y construye civilizaciones. Cuidado con los OVNIs: roban basura y disparan.',
    targets: ['.mini-map'],
    finalLabel: '¡A jugar!',
  },
];

export class Tutorial {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.root = $('tutorial');
    this.card = $('tutorial-card');
    this.titleEl = $('tutorial-title');
    this.textEl = $('tutorial-text');
    this.stepEl = $('tutorial-step');
    this.taskEl = $('tutorial-task');
    this.dotsEl = $('tutorial-dots');
    this.nextBtn = $('tutorial-next');
    this.skipBtn = $('tutorial-skip');
    this.ring = $('tutorial-ring');
    this.ring2 = $('tutorial-ring2');
    this.arrow = $('tutorial-arrow');
    this.active = false;
    this.steps = [];
    this.index = 0;
    this.progress = 0;
    this.onFinish = null;
    this.onStep = null;
    this._advanceTimer = null;

    if (!this.root) return;
    this.nextBtn?.addEventListener('click', (e) => { e.stopPropagation(); this.next(); });
    this.skipBtn?.addEventListener('click', (e) => { e.stopPropagation(); this.finish(true); });
    window.addEventListener('resize', () => { if (this.active) this._layout(); });
    window.addEventListener('orientationchange', () => { if (this.active) setTimeout(() => this._layout(), 250); });
  }

  start(steps) {
    if (!this.root) { if (this.onFinish) this.onFinish(); return; }
    this.steps = steps;
    this.index = 0;
    this.active = true;
    this.root.classList.add('visible');
    this.root.setAttribute('aria-hidden', 'false');
    this._render();
  }

  /** El juego informa del uso de un control (auto-avance). */
  report(kind, amount) {
    if (!this.active) return;
    const step = this.steps[this.index];
    if (!step || step.auto !== kind || this.progress >= 1) return;
    this.progress = Math.min(1, this.progress + amount);
    if (this.taskEl) this.taskEl.style.setProperty('--p', String(this.progress));
    if (this.progress >= 1) {
      this.taskEl?.classList.add('done');
      if (this.taskEl) this.taskEl.textContent = '✔ ¡Bien hecho!';
      clearTimeout(this._advanceTimer);
      this._advanceTimer = setTimeout(() => this.next(), 700);
    }
  }

  next() {
    clearTimeout(this._advanceTimer);
    if (!this.active) return;
    if (this.index >= this.steps.length - 1) { this.finish(false); return; }
    this.index++;
    this._render();
  }

  finish(skipped) {
    clearTimeout(this._advanceTimer);
    if (!this.active) return;
    this.active = false;
    this.root.classList.remove('visible');
    this.root.setAttribute('aria-hidden', 'true');
    document.querySelectorAll('.tut-highlight').forEach(el => el.classList.remove('tut-highlight'));
    settings.set('tutorialDone', true);
    if (this.onFinish) this.onFinish(skipped);
  }

  _render() {
    const step = this.steps[this.index];
    if (!step) return;
    this.progress = 0;
    this.titleEl.textContent = step.title;
    this.textEl.textContent = step.text;
    this.stepEl.textContent = `${this.index + 1} / ${this.steps.length}`;
    const last = this.index === this.steps.length - 1;
    this.nextBtn.textContent = last ? (step.finalLabel || 'Terminar') : 'Siguiente ▶';
    this.skipBtn.style.visibility = last ? 'hidden' : 'visible';
    if (this.taskEl) {
      this.taskEl.classList.remove('done');
      this.taskEl.style.setProperty('--p', '0');
      this.taskEl.textContent = step.task ? `👉 ${step.task}` : '';
      this.taskEl.style.display = step.task ? '' : 'none';
    }
    this.dotsEl.innerHTML = this.steps.map((_, i) => `<i class="${i === this.index ? 'on' : i < this.index ? 'done' : ''}"></i>`).join('');
    document.querySelectorAll('.tut-highlight').forEach(el => el.classList.remove('tut-highlight'));
    (step.targets || []).forEach(sel => document.querySelector(sel)?.classList.add('tut-highlight'));
    if (this.onStep) this.onStep(this.index, step);
    // Esperar un frame para que el layout esté estable
    requestAnimationFrame(() => this._layout());
  }

  _rectOf(sel) {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return r;
  }

  _placeRing(ring, rect, spotlight) {
    if (!ring) return;
    if (!rect) { ring.style.display = 'none'; return; }
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const r = Math.max(rect.width, rect.height) / 2 + 10;
    ring.style.display = 'block';
    ring.style.width = ring.style.height = `${r * 2}px`;
    ring.style.transform = `translate3d(${cx - r}px, ${cy - r}px, 0)`;
    ring.classList.toggle('spotlight', !!spotlight);
    return { cx, cy, r };
  }

  _layout() {
    if (!this.active) return;
    const step = this.steps[this.index];
    const targets = step.targets || [];
    const r1 = this._rectOf(targets[0]);
    const r2 = targets[1] ? this._rectOf(targets[1]) : null;
    const main = this._placeRing(this.ring, r1, true);
    this._placeRing(this.ring2, r2, false);

    // Tarjeta: en la zona opuesta al objetivo
    const W = window.innerWidth;
    const H = window.innerHeight;
    const card = this.card;
    card.style.left = '';
    card.style.right = '';
    card.style.top = '';
    card.style.bottom = '';
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    let left = (W - cw) / 2;
    let top = 12;
    if (main) {
      if (main.cy < H * 0.45) top = H - ch - 16;
      if (main.cx < W * 0.35) left = Math.min(W - cw - 12, W * 0.42);
      else if (main.cx > W * 0.65) left = Math.max(12, W * 0.58 - cw);
    } else {
      top = (H - ch) / 2;
    }
    left = Math.max(8, Math.min(W - cw - 8, left));
    top = Math.max(8, Math.min(H - ch - 8, top));
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;

    // Flecha desde la tarjeta hacia el objetivo
    if (this.arrow) {
      if (!main) { this.arrow.style.display = 'none'; return; }
      const ccx = left + cw / 2;
      const ccy = top + ch / 2;
      const ang = Math.atan2(main.cy - ccy, main.cx - ccx);
      const dist = main.r + 30;
      const ax = main.cx - Math.cos(ang) * dist;
      const ay = main.cy - Math.sin(ang) * dist;
      this.arrow.style.display = 'block';
      this.arrow.style.transform = `translate3d(${ax - 22}px, ${ay - 22}px, 0) rotate(${ang}rad)`;
    }
  }
}
