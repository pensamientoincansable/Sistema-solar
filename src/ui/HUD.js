/**
 * HUD - Interfaz en juego
 */
export class HUD {
  constructor() {
    this.elements = {};
    try { this.init(); } catch (e) { console.error('[HUD] init error:', e); }
  }

  init() {
    try {
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
        refineryHint: document.getElementById('refinery-hint')
      };

      if (this.elements.minimap) {
        try {
          this.minimapCtx = this.elements.minimap.getContext('2d');
          this.elements.minimap.width = 140;
          this.elements.minimap.height = 140;
        } catch (e) {
          this.minimapCtx = null;
        }
      }
    } catch (e) {
      console.error('[HUD] init error:', e);
    }
  }

  show() {
    try { this.elements.container?.classList.add('visible'); } catch (e) {}
  }

  hide() {
    try { this.elements.container?.classList.remove('visible'); } catch (e) {}
  }

  update(walle, solarSystem, trashSystem, civilization, refinery, delta) {
    try {
      // Salud
      if (walle) {
        const hpPercent = (walle.health / walle.maxHealth) * 100;
        if (this.elements.healthBar) {
          this.elements.healthBar.style.width = `${hpPercent}%`;
          this.elements.healthBar.className = 'bar-fill' + (hpPercent < 30 ? ' danger' : '');
        }
        if (this.elements.healthText) {
          this.elements.healthText.textContent = `${Math.round(walle.health)}%`;
        }

        if (this.elements.trashCount) this.elements.trashCount.textContent = walle.trashCount;
        if (this.elements.trashCapacity) this.elements.trashCapacity.textContent = walle.trashCapacity;
      }

      // Materiales
      if (this.elements.materials && walle) {
        try {
          const mats = Object.entries(walle.materials).filter(([k, v]) => v > 0);
          if (mats.length === 0) {
            this.elements.materials.innerHTML = '<div style="opacity:0.5;font-size:0.7rem">Sin materiales</div>';
          } else {
            this.elements.materials.innerHTML = mats.map(([k, v]) => `<div class="material-row"><span>${k}</span><span>${v}</span></div>`).join('');
          }
        } catch (e) {}
      }

      // Planeta cercano
      if (this.elements.planetName && walle && solarSystem) {
        try {
          const closest = solarSystem.getClosestPlanet(walle.position);
          if (closest.planet) {
            this.elements.planetName.textContent = `${closest.planet.config.emoji} ${closest.planet.config.name} (${Math.round(closest.distance)} u)`;
          }
        } catch (e) {}
      }

      // Arma
      if (walle) {
        if (this.elements.weapon) this.elements.weapon.textContent = walle.weapon === 'laser' ? 'LÁSER' : 'PLASMA';
        if (this.elements.ammo) {
          const ammo = walle.ammo[walle.weapon];
          this.elements.ammo.textContent = ammo === Infinity ? '∞' : ammo;
        }
      }

      // Refinería hint
      if (this.elements.refineryHint && refinery && walle) {
        try {
          const refineryStation = refinery.checkDeposit(walle);
          if (refineryStation) {
            this.elements.refineryHint.style.display = 'block';
            this.elements.refineryHint.textContent = `⭘ [ESPACIO] Depositar en ${refineryStation.userData.id}`;
          } else {
            this.elements.refineryHint.style.display = 'none';
          }
        } catch (e) {}
      }

      // Minimap
      if (this.minimapCtx && walle) {
        try { this.updateMinimap(walle, solarSystem, trashSystem); } catch (e) {}
      }
    } catch (e) {
      console.error('[HUD] update error:', e);
    }
  }

  updateMinimap(walle, solarSystem, trashSystem) {
    if (!this.minimapCtx) return;
    try {
      const ctx = this.minimapCtx;
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
      if (solarSystem && solarSystem.planets) {
        solarSystem.planets.forEach(p => {
          try {
            const wp = p.getWorldPosition();
            const x = centerX + wp.x * scale;
            const y = centerY + wp.z * scale;
            if (x < 0 || x > W || y < 0 || y > H) return;
            ctx.fillStyle = '#' + p.config.color.toString(16).padStart(6, '0');
            ctx.beginPath(); ctx.arc(x, y, Math.max(2, p.config.radius * 0.4), 0, Math.PI * 2); ctx.fill();
          } catch (e) {}
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
          } catch (e) {}
        });
      }
      ctx.fillStyle = '#00f0ff';
      ctx.beginPath(); ctx.arc(W / 2, H / 2, 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(W / 2, H / 2, 6, 0, Math.PI * 2); ctx.stroke();
    } catch (e) {
      // minimap opcional, silencioso
    }
  }

  notify(message, type = 'info') {
    if (!this.elements.notifs) return;
    try {
      const div = document.createElement('div');
      div.className = 'notif';
      div.style.borderLeftColor = type === 'danger' ? '#ff3b3b' : type === 'success' ? '#2ecc40' : '#00f0ff';
      div.textContent = message;
      this.elements.notifs.appendChild(div);
      setTimeout(() => { try { div.remove(); } catch (e) {} }, 3000);
    } catch (e) {
      console.error('[HUD] notify error:', e);
    }
  }

  shootEffect() {
    try {
      if (this.elements.crosshair) {
        this.elements.crosshair.classList.add('shoot');
        setTimeout(() => {
          try { this.elements.crosshair.classList.remove('shoot'); } catch (e) {}
        }, 100);
      }
    } catch (e) {}
  }
}
