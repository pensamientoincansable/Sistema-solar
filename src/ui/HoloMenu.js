/**
 * HoloMenu - Menú galáctico holográfico
 */
import { PLANETS_CONFIG, MATERIALS } from '../config/PlanetsConfig.js';

export class HoloMenu {
  constructor(game) {
    this.game = game;
    this.container = document.getElementById('holo-menu');
    this.planetGrid = document.getElementById('planet-grid');
    this.planetInfo = document.getElementById('planet-info');
    this.materialsList = document.getElementById('materials-list');
    this.settings = {
      quality: document.getElementById('setting-quality'),
      camera: document.getElementById('setting-camera'),
      sound: document.getElementById('setting-sound')
    };
    try { this.init(); } catch (e) { console.error('[HoloMenu] init error:', e); }
  }

  init() {
    // Planetas grid
    if (this.planetGrid) {
      try {
        this.planetGrid.innerHTML = PLANETS_CONFIG.map(p => `
          <div class="planet-chip" data-planet="${p.id}" role="button" tabindex="0">
            <span>${p.emoji}</span>
            ${p.name}
          </div>
        `).join('');
        this.planetGrid.querySelectorAll('.planet-chip').forEach(el => {
          const open = () => {
            const id = el.dataset.planet;
            const planet = PLANETS_CONFIG.find(pp => pp.id === id);
            this.planetGrid.querySelectorAll('.planet-chip').forEach(c => c.classList.toggle('selected', c === el));
            this.showPlanetInfo(planet);
          };
          el.addEventListener('click', open);
          el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
        });
      } catch (e) {
        console.error('[HoloMenu] planetGrid error:', e);
      }
    }

    // Botones menú
    const btnPlay = document.getElementById('btn-play');
    btnPlay?.addEventListener('click', () => {
      if (this.game.hasStarted) this.game.restartGame();
      else this.game.startGame();
    });
    document.getElementById('btn-continue')?.addEventListener('click', () => this.game.resumeGame());
    document.getElementById('btn-planets')?.addEventListener('click', () => this.showSection('planets'));
    document.getElementById('btn-civilization')?.addEventListener('click', () => this.showSection('civilization'));
    document.getElementById('btn-settings')?.addEventListener('click', () => this.showSection('settings'));
    document.getElementById('btn-exit')?.addEventListener('click', () => {
      if (this.game.isPlaying) {
        this.game.pauseGame();
      } else {
        // Los navegadores no permiten cerrar pestañas que no abrió un script
        this.game.hud?.notify('Para salir, cierra la pestaña del navegador', 'info');
      }
    });

    // Botón construir civilización
    document.getElementById('btn-build')?.addEventListener('click', () => {
      const sel = document.getElementById('build-planet-select');
      if (!sel || !this.game.civilization) return;
      try {
        const id = sel.value;
        const result = this.game.civilization.build(id, this.game.scene);
        const planet = PLANETS_CONFIG.find(p => p.id === id);
        const name = planet ? planet.name : id;
        if (result.can) {
          this.game.hud?.notify(`¡${planet?.civilization.name || 'Civilización'} construida en ${name}! Bonus: ${result.bonus}`, 'success');
          this.updateMaterials();
        } else if (result.missing) {
          const m = MATERIALS[result.missing] || { name: result.missing, icon: '' };
          this.game.hud?.notify(`Faltan materiales para ${name}: ${m.icon} ${m.name} ${result.have}/${result.need}`, 'danger');
        } else {
          this.game.hud?.notify(result.reason || 'No se puede construir', 'danger');
        }
      } catch (e) {
        console.error('[HoloMenu] btn-build error:', e);
      }
    });

    // Build select
    const buildSelect = document.getElementById('build-planet-select');
    if (buildSelect) {
      buildSelect.innerHTML = PLANETS_CONFIG.map(p => `<option value="${p.id}">${p.emoji} ${p.name}</option>`).join('');
    }

    // Ajustes
    this.settings.quality?.addEventListener('change', () => {
      const idx = this.settings.quality.selectedIndex; // 0 auto, 1 baja, 2 media, 3 alta, 4 ultra
      if (!this.game.adaptive) return;
      if (idx === 0) this.game.adaptive.setAuto();
      else this.game.adaptive.setQualityLevel(idx - 1);
      this.game.quality = this.game.adaptive.getQualitySettings();
      this.game.hud?.notify(`Calidad: ${this.settings.quality.value}`, 'info');
    });
    this.settings.camera?.addEventListener('change', () => {
      const first = this.settings.camera.selectedIndex === 1;
      this.game.walle?.setCameraMode(first ? 'first' : 'third');
    });

    // Mostrar la info del primer planeta por defecto
    if (this.planetInfo) this.showPlanetInfo(PLANETS_CONFIG[2] || PLANETS_CONFIG[0]);
  }

  show() {
    try {
      this.container?.classList.remove('hidden');
      const btnPlay = document.getElementById('btn-play');
      if (btnPlay && this.game.hasStarted) {
        btnPlay.innerHTML = '⟲ Nueva Misión <small>Reiniciar desde la Tierra</small>';
        btnPlay.classList.remove('active');
        document.getElementById('btn-continue')?.classList.add('active');
      }
    } catch (e) { /* noop */ }
  }

  hide() {
    try { this.container?.classList.add('hidden'); } catch (e) { /* noop */ }
  }

  showSection(section) {
    try {
      const el = document.getElementById(`section-${section}`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      el.classList.remove('flash');
      // reflow para reiniciar la animación
      void el.offsetWidth;
      el.classList.add('flash');
    } catch (e) {
      console.error('[HoloMenu] showSection error:', e);
    }
  }

  showPlanetInfo(planet) {
    if (!planet) return;
    try {
      const req = Object.entries(planet.civilization.requiredMaterials)
        .map(([k, v]) => {
          const m = MATERIALS[k] || { icon: '', name: k };
          const have = this.game.civilization ? (this.game.civilization.inventory[k] || 0) : 0;
          const ok = have >= v;
          return `<span class="req ${ok ? 'ok' : ''}">${m.icon} ${m.name} ${have}/${v}</span>`;
        }).join('');
      const html = `
        <div class="planet-info-head"><span>${planet.emoji}</span><strong>${planet.name}</strong>
          <em>${planet.environment.temp}°C · ${planet.environment.gravity}g · ${planet.environment.hazard}</em></div>
        <div class="planet-info-body">
          <div><b>Basura:</b> ${planet.trashType}</div>
          <div><b>Civilización:</b> ${planet.civilization.name} — ${planet.civilization.description}</div>
          <div><b>Bonus:</b> ${planet.civilization.bonus}</div>
          <div class="reqs">${req}</div>
        </div>`;
      if (this.planetInfo) {
        this.planetInfo.innerHTML = html;
      } else {
        // Fallback si no existe el panel
        alert(`${planet.emoji} ${planet.name}\n${planet.civilization.name}: ${planet.civilization.description}`);
      }
      this._lastPlanetInfo = planet;
    } catch (e) {
      console.error('[HoloMenu] showPlanetInfo error:', e);
    }
  }

  updateMaterials() {
    try {
      if (!this.materialsList || !this.game.civilization) return;
      const list = this.game.civilization.getInventoryList().filter(m => m.amount > 0);
      this.materialsList.innerHTML = list.map(m => `
        <div class="material-row">
          <span>${m.icon} ${m.name}</span>
          <span style="color:${m.color}">${m.amount}</span>
        </div>
      `).join('') || '<div style="opacity:0.5;font-size:0.75rem">Recolecta basura y deposítala en una refinería</div>';

      const prog = this.game.civilization.getProgress();
      const progEl = document.getElementById('civilization-progress');
      if (progEl) progEl.textContent = `${prog.colonized}/${prog.totalPlanets} planetas (${prog.percent}%) - ${prog.totalBuilt} estructuras`;

      // Refrescar requisitos del planeta mostrado
      if (this._lastPlanetInfo) this.showPlanetInfo(this._lastPlanetInfo);
    } catch (e) {
      console.error('[HoloMenu] updateMaterials error:', e);
    }
  }

  setContinueVisible(visible) {
    try {
      const btn = document.getElementById('btn-continue');
      if (btn) btn.style.display = visible ? 'block' : 'none';
    } catch (e) { /* noop */ }
  }
}
