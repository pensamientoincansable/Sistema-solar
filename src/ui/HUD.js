/**
 * HUD - Interfaz en juego
 */
import { MATERIALS } from '../config/PlanetsConfig.js';

export class HUD {
  constructor() {
    this.elements = {};
    this.onPause = null;
    this._cache = {};        // último valor pintado por elemento (evita repintar el DOM cada frame)
    this._domTimer = 0;      // acumulador para refrescar textos a ~10 Hz
    try { this.init(); } catch (e) { console.error('[HUD] init error:', e); }
  }

  init() {
    this.elements = {
      container: document.getElementById('hud'),
      healthBar: document.getElementById('health-bar'),
      healthText: document.getElementById('health-text'),
      trashCount: document.getElementById('trash-count'),
      trashCapacity: document.getElementById('trash-capacity'),
      materials: document.getElementById('hud-materials'),
      planetName: document.getElementById('hud-planet'),
      weapon: document.getElementById('hud-weapon'),
      ammo: document.getElementById('hud-ammo'),
      minimap: document.getElementById('minimap-canvas'),
      notifs: document.getElementById('notifications'),
      crosshair: document.getElementById('crosshair'),
      refineryHint: document.getElementById('refinery-hint'),
      pauseBtn: document.getElementById('btn-pause'),
      speed: document.getElementById('hud-speed')
    };

    if (this.elements.minimap) {
      try {
        this.elements.minimap.width = 140;
        this.elements.minimap.height = 140;
        this.minimapCtx = this.elements.minimap.getContext('2d');
      } catch (e) {
        this.minimapCtx = null;
      }
    }

    if (this.elements.pauseBtn) {
      this.elements.pauseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.onPause) this.onPause();
      });
    }
  }

  show() {
    try { this.elements.container?.classList.add('visible'); } catch (e) { /* noop */ }
  }

  hide() {
    try { this.elements.container?.classList.remove('visible'); } catch (e) { /* noop */ }
  }

  _setText(key, el, value) {
    if (!el) return;
    if (this._cache[key] === value) return;
    this._cache[key] = value;
    el.textContent = value;
  }

  _setHTML(key, el, value) {
    if (!el) return;
    if (this._cache[key] === value) return;
    this._cache[key] = value;
    el.innerHTML = value;
  }

  update(walle, solarSystem, trashSystem, civilization, refinery, delta) {
    try {
      if (!walle) return;
      const el = this.elements;

      // Salud (barra: cada frame, es barato)
      const hpPercent = (walle.health / walle.maxHealth) * 100;
      if (el.healthBar) {
        el.healthBar.style.width = `${hpPercent}%`;
        const cls = 'bar-fill' + (hpPercent < 30 ? ' danger' : '');
        if (el.healthBar.className !== cls) el.healthBar.className = cls;
      }

      // Textos a ~10 Hz
      this._domTimer += delta || 0;
      const refreshText = this._domTimer >= 0.1;
      if (refreshText) {
        this._domTimer = 0;
        this._setText('hp', el.healthText, `${Math.round(walle.health)}%`);
        this._setText('trash', el.trashCount, String(walle.trashCount));
        this._setText('cap', el.trashCapacity, String(walle.trashCapacity));
        if (el.speed) this._setText('speed', el.speed, `${Math.round(walle.velocity.length())} u/s`);

        // Materiales a bordo
        const mats = Object.entries(walle.materials).filter(([, v]) => v > 0);
        const html = mats.length === 0
          ? '<div style="opacity:0.5;font-size:0.7rem">Sin materiales</div>'
          : mats.map(([k, v]) => {
            const m = MATERIALS[k] || { icon: '', name: k };
            return `<div class="material-row"><span>${m.icon} ${m.name}</span><span>${v}</span></div>`;
          }).join('');
        this._setHTML('mats', el.materials, html);

        // Planeta cercano
        if (el.planetName && solarSystem) {
          const closest = solarSystem.getClosestPlanet(walle.position);
          if (closest.planet) {
            this._setText('planet', el.planetName, `${closest.planet.config.emoji} ${closest.planet.config.name} (${Math.round(closest.distance)} u)`);
          }
        }

        // Arma
        this._setText('weapon', el.weapon, walle.weapon === 'laser' ? 'LÁSER' : 'PLASMA');
        const ammo = walle.ammo[walle.weapon];
        this._setText('ammo', el.ammo, ammo === Infinity ? '∞' : String(ammo));

        // Refinería hint
        if (el.refineryHint && refinery) {
          const station = refinery.checkDeposit(walle);
          if (station) {
            const label = station.userData.label || station.userData.id;
            this._setText('hint', el.refineryHint, `⭘ [ESPACIO / 📦] Depositar en ${label}`);
            if (el.refineryHint.style.display !== 'block') el.refineryHint.style.display = 'block';
          } else if (el.refineryHint.style.display !== 'none') {
            el.refineryHint.style.display = 'none';
          }
        }
      }

      // Minimap
      if (this.minimapCtx) {
        try { this.updateMinimap(walle, solarSystem, trashSystem); } catch (e) { /* noop */ }
      }
    } catch (e) {
      console.error('[HUD] update error:', e);
    }
  }

  updateMinimap(walle, solarSystem, trashSystem) {
    const ctx = this.minimapCtx;
    if (!ctx) return;
    const W = 140, H = 140;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,15,30,0.9)';
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 68, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,240,255,0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.arc(W / 2, H / 2, (i + 1) * 17, 0, Math.PI * 2); ctx.stroke();
    }
    const scale = 0.25;
    const centerX = W / 2 - walle.position.x * scale;
    const centerY = H / 2 - walle.position.z * scale;

    // Sol
    {
      const x = centerX, y = centerY;
      if (x >= 0 && x <= W && y >= 0 && y <= H) {
        ctx.fillStyle = '#ffcc33';
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      }
    }

    if (solarSystem && solarSystem.planets) {
      solarSystem.planets.forEach(p => {
        try {
          const wp = p.getWorldPosition();
          const x = centerX + wp.x * scale;
          const y = centerY + wp.z * scale;
          if (x < 0 || x > W || y < 0 || y > H) return;
          ctx.fillStyle = '#' + p.config.color.toString(16).padStart(6, '0');
          ctx.beginPath(); ctx.arc(x, y, Math.max(2, p.config.radius * 0.4), 0, Math.PI * 2); ctx.fill();
        } catch (e) { /* noop */ }
      });
    }
    ctx.fillStyle = '#ffe600';
    if (trashSystem && trashSystem.trashList) {
      trashSystem.trashList.forEach(t => {
        try {
          const dist = t.mesh.position.distanceTo(walle.position);
          if (dist > 120) return;
          const x = centerX + t.mesh.position.x * scale;
          const y = centerY + t.mesh.position.z * scale;
          if (x < 0 || x > W || y < 0 || y > H) return;
          ctx.fillRect(x - 1, y - 1, 2, 2);
        } catch (e) { /* noop */ }
      });
    }

    // Jugador con indicador de rumbo
    const fwd = { x: Math.sin(walle.rotation.y), z: Math.cos(walle.rotation.y) };
    ctx.strokeStyle = '#00f0ff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(W / 2, H / 2); ctx.lineTo(W / 2 + fwd.x * 10, H / 2 + fwd.z * 10); ctx.stroke();
    ctx.fillStyle = '#00f0ff';
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(W / 2, H / 2, 6, 0, Math.PI * 2); ctx.stroke();
  }

  notify(message, type = 'info') {
    if (!this.elements.notifs) return;
    try {
      // Evitar spam: si el último mensaje es idéntico, no duplicar
      const last = this.elements.notifs.lastElementChild;
      if (last && last.textContent === message) return;
      const div = document.createElement('div');
      div.className = 'notif';
      div.style.borderLeftColor = type === 'danger' ? '#ff3b3b' : type === 'success' ? '#2ecc40' : '#00f0ff';
      div.textContent = message;
      this.elements.notifs.appendChild(div);
      // Máximo 5 notificaciones visibles
      while (this.elements.notifs.children.length > 5) {
        this.elements.notifs.removeChild(this.elements.notifs.firstElementChild);
      }
      setTimeout(() => { try { div.remove(); } catch (e) { /* noop */ } }, 3000);
    } catch (e) {
      console.error('[HUD] notify error:', e);
    }
  }

  shootEffect() {
    try {
      if (this.elements.crosshair) {
        this.elements.crosshair.classList.add('shoot');
        setTimeout(() => {
          try { this.elements.crosshair.classList.remove('shoot'); } catch (e) { /* noop */ }
        }, 100);
      }
    } catch (e) { /* noop */ }
  }
}
