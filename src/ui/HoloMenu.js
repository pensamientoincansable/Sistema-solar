/**
 * HoloMenu - Menú galáctico holográfico.
 * Columna izquierda: acciones. Columna derecha: UNA tarjeta visible cada vez
 * (pestañas), para que en móvil horizontal quepa todo sin hacer scroll.
 */
import { PLANETS_CONFIG, MATERIALS } from '../config/PlanetsConfig.js';
import { settings } from '../systems/Settings.js';

export class HoloMenu {
  constructor(game) {
    this.game = game;
    this.container = document.getElementById('holo-menu');
    this.planetGrid = document.getElementById('planet-grid');
    this.planetInfo = document.getElementById('planet-info');
    this.materialsList = document.getElementById('materials-list');
    this.onTutorial = null;
    this.section = 'goal';
    try { this.init(); } catch (e) { console.error('[HoloMenu] init error:', e); }
  }

  init() {
    const $ = (id) => document.getElementById(id);

    // Rejilla de planetas
    if (this.planetGrid) {
      this.planetGrid.innerHTML = PLANETS_CONFIG.map(p => `
        <div class="planet-chip" data-planet="${p.id}" role="button" tabindex="0">
          <span>${p.emoji}</span>${p.name}
        </div>`).join('');
      this.planetGrid.querySelectorAll('.planet-chip').forEach(el => {
        const open = () => {
          const planet = PLANETS_CONFIG.find(pp => pp.id === el.dataset.planet);
          this.planetGrid.querySelectorAll('.planet-chip').forEach(c => c.classList.toggle('selected', c === el));
          this.showPlanetInfo(planet);
        };
        el.addEventListener('click', open);
        el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      });
    }

    // Acciones principales
    $('btn-play')?.addEventListener('click', () => {
      if (this.game.hasStarted) this.game.restartGame();
      else this.game.startGame();
    });
    $('btn-continue')?.addEventListener('click', () => this.game.resumeGame());
    document.querySelectorAll('.tab-btn[data-section]').forEach(btn => {
      btn.addEventListener('click', () => this.showSection(btn.dataset.section));
    });
    const tut = () => { if (this.onTutorial) this.onTutorial(); };
    $('btn-tutorial')?.addEventListener('click', tut);
    $('btn-tutorial-2')?.addEventListener('click', tut);
    $('btn-exit')?.addEventListener('click', () => {
      if (this.game.isPlaying) this.game.pauseGame();
      else this.game.hud?.notify('Para salir, cierra la pestaña del navegador', 'info');
    });

    // Construir civilización
    $('btn-build')?.addEventListener('click', () => {
      const sel = $('build-planet-select');
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
    const buildSelect = $('build-planet-select');
    if (buildSelect) buildSelect.innerHTML = PLANETS_CONFIG.map(p => `<option value="${p.id}">${p.emoji} ${p.name}</option>`).join('');

    this._bindSettings();
    if (this.planetInfo) this.showPlanetInfo(PLANETS_CONFIG[2] || PLANETS_CONFIG[0]);
    this.showSection('goal');
  }

  _bindSettings() {
    const $ = (id) => document.getElementById(id);

    const quality = $('setting-quality');
    if (quality) {
      quality.selectedIndex = Math.max(0, Math.min(4, settings.get('quality') | 0));
      quality.addEventListener('change', () => {
        const idx = quality.selectedIndex; // 0 auto, 1 baja, 2 media, 3 alta, 4 ultra
        settings.set('quality', idx);
        if (this.game.applyQualitySetting) this.game.applyQualitySetting(idx);
        this.game.hud?.notify(`Calidad: ${quality.value}`, 'info');
      });
    }

    const camera = $('setting-camera');
    if (camera) {
      camera.selectedIndex = settings.get('cameraStart') === 'first' ? 1 : 0;
      camera.addEventListener('change', () => {
        const first = camera.selectedIndex === 1;
        settings.set('cameraStart', first ? 'first' : 'third');
        this.game.walle?.setCameraMode(first ? 'first' : 'third');
      });
    }

    const slider = (id, key, fmt) => {
      const input = $(id);
      const out = $(id + '-val');
      if (!input) return;
      input.value = String(settings.get(key));
      if (out) out.textContent = fmt(Number(input.value));
      input.addEventListener('input', () => {
        const v = Number(input.value);
        settings.set(key, v);
        if (out) out.textContent = fmt(v);
      });
    };
    slider('setting-look', 'lookSensitivity', v => `${v.toFixed(1)}×`);
    slider('setting-mouse', 'mouseSensitivity', v => `${v.toFixed(1)}×`);
    slider('setting-scale', 'controlScale', v => `${Math.round(v * 100)}%`);
    slider('setting-sound', 'volume', v => String(Math.round(v)));

    const toggle = (id, key) => {
      const input = $(id);
      if (!input) return;
      input.checked = !!settings.get(key);
      input.addEventListener('change', () => settings.set(key, input.checked));
    };
    toggle('setting-vibration', 'vibration');
    toggle('setting-fullscreen', 'fullscreen');
  }

  show() {
    this.container?.classList.remove('hidden');
    const btnPlay = document.getElementById('btn-play');
    if (btnPlay && this.game.hasStarted) {
      btnPlay.innerHTML = '⟲ Nueva misión <small>Reiniciar desde la Tierra</small>';
      btnPlay.classList.remove('active');
      document.getElementById('btn-continue')?.classList.add('active');
    }
    this.updateMaterials();
  }

  hide() { this.container?.classList.add('hidden'); }

  showSection(section) {
    const el = document.getElementById(`section-${section}`);
    if (!el) return;
    this.section = section;
    document.querySelectorAll('.holo-card').forEach(c => c.classList.toggle('active', c === el));
    document.querySelectorAll('.tab-btn[data-section]').forEach(b => b.classList.toggle('selected', b.dataset.section === section));
    if (section === 'civilization') this.updateMaterials();
  }

  showPlanetInfo(planet) {
    if (!planet) return;
    try {
      const req = Object.entries(planet.civilization.requiredMaterials)
        .map(([k, v]) => {
          const m = MATERIALS[k] || { icon: '', name: k };
          const have = this.game.civilization ? (this.game.civilization.inventory[k] || 0) : 0;
          return `<span class="req ${have >= v ? 'ok' : ''}">${m.icon} ${m.name} ${have}/${v}</span>`;
        }).join('');
      const mats = (planet.trashMaterials || []).map(k => (MATERIALS[k] ? `${MATERIALS[k].icon} ${MATERIALS[k].name}` : k)).join(' · ');
      const water = planet.id === 'earth' ? '<div><b>Especial:</b> 💧 abundan las gotas de agua a su alrededor</div>'
        : planet.id === 'neptune' ? '<div><b>Especial:</b> 💧 algunas gotas de agua en órbita</div>' : '';
      this.planetInfo.innerHTML = `
        <div class="planet-info-head"><span>${planet.emoji}</span><strong>${planet.name}</strong>
          <em>${planet.environment.temp}°C · ${planet.environment.gravity}g · ${planet.environment.hazard}</em></div>
        <div class="planet-info-body">
          <div><b>Basura:</b> ${planet.trashType}${mats ? ` (${mats})` : ''}</div>
          ${water}
          <div><b>Civilización:</b> ${planet.civilization.name} — ${planet.civilization.description}</div>
          <div><b>Bonus:</b> ${planet.civilization.bonus}</div>
          <div class="reqs">${req}</div>
        </div>`;
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
        <div class="material-row"><span>${m.icon} ${m.name}</span><span style="color:${m.color}">${m.amount}</span></div>
      `).join('') || '<div class="muted" style="font-size:0.78rem">Recolecta basura y deposítala en una refinería</div>';
      const prog = this.game.civilization.getProgress();
      const progEl = document.getElementById('civilization-progress');
      if (progEl) progEl.textContent = `${prog.colonized}/${prog.totalPlanets} planetas (${prog.percent}%) - ${prog.totalBuilt} estructuras`;
      if (this._lastPlanetInfo) this.showPlanetInfo(this._lastPlanetInfo);
    } catch (e) {
      console.error('[HoloMenu] updateMaterials error:', e);
    }
  }

  setContinueVisible(visible) {
    const btn = document.getElementById('btn-continue');
    if (btn) btn.style.display = visible ? 'block' : 'none';
    document.getElementById('menu-primary')?.classList.toggle('two', !!visible);
  }
}
