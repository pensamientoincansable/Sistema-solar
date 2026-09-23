/**
 * HUD - Interfaz en juego
 */
export class HUD {
  constructor() {
    this.elements = {};
    this.init();
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
      refineryHint: document.getElementById('refinery-hint')
    };

    // Minimap canvas
    if (this.elements.minimap) {
      this.minimapCtx = this.elements.minimap.getContext('2d');
      this.elements.minimap.width = 140;
      this.elements.minimap.height = 140;
    }
  }

  show() {
    this.elements.container?.classList.add('visible');
  }

  hide() {
    this.elements.container?.classList.remove('visible');
  }

  update(walle, solarSystem, trashSystem, civilization, refinery, delta) {
    // Salud
    const hpPercent = (walle.health / walle.maxHealth)*100;
    if (this.elements.healthBar) {
      this.elements.healthBar.style.width = `${hpPercent}%`;
      this.elements.healthBar.className = 'bar-fill' + (hpPercent < 30 ? ' danger' : '');
    }
    if (this.elements.healthText) {
      this.elements.healthText.textContent = `${Math.round(walle.health)}%`;
    }

    // Basura
    if (this.elements.trashCount) this.elements.trashCount.textContent = walle.trashCount;
    if (this.elements.trashCapacity) this.elements.trashCapacity.textContent = walle.trashCapacity;

    // Materiales
    if (this.elements.materials) {
      const mats = Object.entries(walle.materials).filter(([k,v])=>v>0);
      if (mats.length===0) {
        this.elements.materials.innerHTML = '<div style="opacity:0.5;font-size:0.7rem">Sin materiales</div>';
      } else {
        this.elements.materials.innerHTML = mats.map(([k,v])=> `<div class="material-row"><span>${k}</span><span>${v}</span></div>`).join('');
      }
    }

    // Planeta cercano
    const closest = solarSystem.getClosestPlanet(walle.position);
    if (this.elements.planetName && closest.planet) {
      this.elements.planetName.textContent = `${closest.planet.config.emoji} ${closest.planet.config.name} (${Math.round(closest.distance)} u)`;
    }

    // Arma
    if (this.elements.weapon) this.elements.weapon.textContent = walle.weapon === 'laser' ? 'LÁSER' : 'PLASMA';
    if (this.elements.ammo) {
      const ammo = walle.ammo[walle.weapon];
      this.elements.ammo.textContent = ammo === Infinity ? '∞' : ammo;
    }

    // Refinería hint
    const refineryStation = refinery.checkDeposit(walle);
    if (this.elements.refineryHint) {
      if (refineryStation) {
        this.elements.refineryHint.style.display = 'block';
        this.elements.refineryHint.textContent = `⭘ [ESPACIO] Depositar en ${refineryStation.userData.id}`;
      } else {
        this.elements.refineryHint.style.display = 'none';
      }
    }

    // Minimap
    this.updateMinimap(walle, solarSystem, trashSystem);
  }

  updateMinimap(walle, solarSystem, trashSystem) {
    if (!this.minimapCtx) return;
    const ctx = this.minimapCtx;
    const W = 140, H = 140;
    ctx.clearRect(0,0,W,H);
    // Fondo
    ctx.fillStyle = 'rgba(0,15,30,0.9)';
    ctx.beginPath(); ctx.arc(W/2,H/2,68,0,Math.PI*2); ctx.fill();
    // Grid
    ctx.strokeStyle = 'rgba(0,240,255,0.1)';
    ctx.lineWidth = 1;
    for (let i=0;i<4;i++) {
      ctx.beginPath(); ctx.arc(W/2,H/2, (i+1)*17,0,Math.PI*2); ctx.stroke();
    }
    // Planetas
    const scale = 0.25; // escalar mundo a minimapa
    const centerX = W/2 - walle.position.x*scale;
    const centerY = H/2 - walle.position.z*scale;
    solarSystem.planets.forEach(p => {
      const wp = p.getWorldPosition();
      const x = centerX + wp.x*scale;
      const y = centerY + wp.z*scale;
      if (x<0||x>W||y<0||y>H) return;
      ctx.fillStyle = '#'+p.config.color.toString(16).padStart(6,'0');
      ctx.beginPath(); ctx.arc(x,y, Math.max(2, p.config.radius*0.4),0,Math.PI*2); ctx.fill();
    });
    // Basura cercana
    ctx.fillStyle = '#ffe600';
    trashSystem.trashList.forEach(t => {
      const dist = t.mesh.position.distanceTo(walle.position);
      if (dist>120) return;
      const x = centerX + t.mesh.position.x*scale;
      const y = centerY + t.mesh.position.z*scale;
      if (x<0||x>W||y<0||y>H) return;
      ctx.fillRect(x-1,y-1,2,2);
    });
    // Enemigos
    ctx.fillStyle = '#ff3333';
    // WALL-E en centro
    ctx.fillStyle = '#00f0ff';
    ctx.beginPath(); ctx.arc(W/2,H/2,4,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(W/2,H/2,6,0,Math.PI*2); ctx.stroke();
  }

  notify(message, type='info') {
    if (!this.elements.notifs) return;
    const div = document.createElement('div');
    div.className = 'notif';
    div.style.borderLeftColor = type==='danger' ? '#ff3b3b' : type==='success' ? '#2ecc40' : '#00f0ff';
    div.textContent = message;
    this.elements.notifs.appendChild(div);
    setTimeout(()=> { div.remove(); }, 3000);
  }

  shootEffect() {
    if (this.elements.crosshair) {
      this.elements.crosshair.classList.add('shoot');
      setTimeout(()=> this.elements.crosshair.classList.remove('shoot'), 100);
    }
  }
}
