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
    $('btn-continue')?.addEventListener('click', () => {
      if (this.game.hasStarted) this.game.resumeGame();
      else this.game.loadFromSlot('autosave');
    });
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

    // Desbloquear acceso a la superficie (no crea meshes orbitales)
    $('btn-build')?.addEventListener('click', () => {
      const sel = $('build-planet-select');
      if (!sel || !this.game.civilization) return;
      try {
        const id = sel.value;
        const result = this.game.civilization.build(id, this.game.scene);
        const planet = PLANETS_CONFIG.find(p => p.id === id);
        const name = planet ? planet.name : id;
        if (result.can) {
          this.game.hud?.notify(`✅ Acceso a la superficie de ${name} desbloqueado. Mantén G cerca del planeta para entrar.`, 'success');
          this.updateMaterials();
        } else if (result.unlocked) {
          this.game.hud?.notify(`✅ ${name} ya tiene el acceso desbloqueado. Mantén G cerca del planeta para entrar.`, 'info');
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
    if (buildSelect) {
      buildSelect.innerHTML = PLANETS_CONFIG.map(p => `<option value="${p.id}">${p.emoji} ${p.name}</option>`).join('');
      buildSelect.addEventListener('change', () => {
        const planet = PLANETS_CONFIG.find(p => p.id === buildSelect.value);
        if (planet) this.showPlanetInfo(planet);
        this.updateMaterials();
      });
    }

    this._bindSaveSection();
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

  // ------------------------------------------------------ Partida guardada

  _bindSaveSection() {
    const $ = (id) => document.getElementById(id);
    this.saveSlots = $('save-slots');
    this.saveStatus = $('save-status');

    this.saveSlots?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-slot-action]');
      if (!btn || btn.disabled) return;
      const slot = btn.dataset.slot;
      const act = btn.dataset.slotAction;
      const game = this.game;
      if (!game || !game.save) return;
      if (act === 'save') game.saveToSlot(slot, this._slotLabel(slot));
      else if (act === 'load') {
        const r = game.loadFromSlot(slot);
        this.setSaveStatus(r.ok ? 'Partida cargada. ¡A jugar!' : (r.reason || 'No se pudo cargar'), r.ok);
      } else if (act === 'delete') {
        game.save.remove(slot);
        this.setSaveStatus(`Hueco borrado`, true);
      }
      this.refreshSaves();
    });

    $('btn-save-export')?.addEventListener('click', () => {
      this.game.exportSaveFile(this._lastSlot || 'autosave');
    });
    $('btn-save-import')?.addEventListener('click', () => { this.game.importSaveFile(); });

    const auto = $('setting-autosave');
    if (auto) {
      auto.checked = settings.get('autosave') !== false;
      auto.addEventListener('change', () => {
        settings.set('autosave', auto.checked);
        if (this.game.save) {
          if (auto.checked) this.game.save.startAutosave();
          else this.game.save.stopAutosave();
        }
        this.setSaveStatus(auto.checked ? 'Autoguardado activado' : 'Autoguardado desactivado', auto.checked);
      });
    }
  }

  _slotLabel(slot) {
    return slot === 'autosave' ? 'Automático' : slot.replace('slot', 'Hueco ');
  }

  setSaveStatus(text, ok = false) {
    if (!this.saveStatus) return;
    this.saveStatus.textContent = text;
    this.saveStatus.className = 'save-status ' + (ok ? 'ok' : text ? 'error' : 'muted');
  }

  /** Lista los huecos de guardado con su fecha y acciones. */
  refreshSaves() {
    if (!this.saveSlots || !this.game || !this.game.save) return;
    try {
      const list = this.game.save.list();
      this._lastSlot = list.find(s => !s.empty)?.id || 'autosave';
      this.saveSlots.innerHTML = list.map((slot) => {
        const label = this._slotLabel(slot.id);
        if (slot.empty) {
          return `<div class="save-slot empty">
            <div class="save-slot-info"><b>${label}</b><small>Vacío</small></div>
            <div class="save-slot-actions">
              <button class="save-mini" data-slot-action="save" data-slot="${slot.id}" type="button">Guardar aquí</button>
            </div>
          </div>`;
        }
        const d = new Date(slot.savedAt);
        const when = isNaN(d.getTime()) ? slot.savedAt : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        const mins = Math.floor((slot.playTime || 0) / 60);
        return `<div class="save-slot">
          <div class="save-slot-info"><b>${label}</b>
            <small>${when} · ${slot.label || ''} · ${mins} min jugados</small></div>
          <div class="save-slot-actions">
            <button class="save-mini" data-slot-action="save" data-slot="${slot.id}" type="button">Guardar</button>
            <button class="save-mini" data-slot-action="load" data-slot="${slot.id}" type="button">Cargar</button>
            <button class="save-mini danger" data-slot-action="delete" data-slot="${slot.id}" type="button" aria-label="Borrar">✕</button>
          </div>
        </div>`;
      }).join('');
    } catch (e) {
      console.error('[HoloMenu] refreshSaves error:', e);
    }
  }

  show() {
    this.container?.classList.remove('hidden');
    this.refreshSaves();
    const hasAuto = this._hasAutosave();
    this.setContinueVisible(!!this.game.hasStarted || hasAuto);
    const btnPlay = document.getElementById('btn-play');
    if (btnPlay && this.game.hasStarted) {
      btnPlay.innerHTML = '⟲ Nueva misión <small>Reiniciar desde la Tierra</small>';
      btnPlay.classList.remove('active');
      document.getElementById('btn-continue')?.classList.add('active');
    } else if (btnPlay && hasAuto) {
      document.getElementById('btn-continue')?.classList.add('active');
    }
    this.updateMaterials();
  }

  _hasAutosave() {
    try {
      return !!(this.game.save && this.game.save.list().some(s => s.id === 'autosave' && !s.empty));
    } catch (e) {
      return false;
    }
  }

  hide() { this.container?.classList.add('hidden'); }

  showSection(section) {
    const el = document.getElementById(`section-${section}`);
    if (!el) return;
    this.section = section;
    document.querySelectorAll('.holo-card').forEach(c => c.classList.toggle('active', c === el));
    document.querySelectorAll('.tab-btn[data-section]').forEach(b => b.classList.toggle('selected', b.dataset.section === section));
    if (section === 'civilization') this.updateMaterials();
    if (section === 'save') this.refreshSaves();
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
      const unlocked = !!(this.game.civilization && this.game.civilization.isUnlocked(planet.id));
      const access = unlocked
        ? '<div class="access-status ok"><b>✅ Acceso desbloqueado.</b> Mantén G/🌍 cerca del planeta para jugar la colonia en superficie.</div>'
        : '<div class="access-status"><b>🔒 Acceso bloqueado.</b> Reúne todos los materiales y pulsa «Desbloquear acceso».</div>';
      const water = planet.id === 'earth' ? '<div><b>Especial:</b> 💧 gotas de agua útiles, con abundancia moderada</div>'
        : planet.id === 'neptune' ? '<div><b>Especial:</b> 💧 algunas gotas de agua en órbita</div>' : '';
      this.planetInfo.innerHTML = `
        <div class="planet-info-head"><span>${planet.emoji}</span><strong>${planet.name}</strong>
          <em>${planet.environment.temp}°C · ${planet.environment.gravity}g · ${planet.environment.hazard}</em></div>
        <div class="planet-info-body">
          <div><b>Basura:</b> ${planet.trashType}${mats ? ` (${mats})` : ''}</div>
          ${water}
          <div><b>Civilización:</b> ${planet.civilization.name} — ${planet.civilization.description}</div>
          <div><b>Bonus:</b> ${planet.civilization.bonus}</div>
          ${access}
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
      const colonies = this.game.civ ? this.game.civ.colonies.size : 0;
      if (progEl) {
        progEl.textContent = `${prog.colonized}/${prog.totalPlanets} accesos (${prog.percent}%) · ${colonies} colonia${colonies === 1 ? '' : 's'} en superficie`;
      }
      const select = document.getElementById('build-planet-select');
      const button = document.getElementById('btn-build');
      if (select && this.game.civilization) {
        for (const option of select.options) {
          const check = this.game.civilization.canBuild(option.value);
          const planet = PLANETS_CONFIG.find(item => item.id === option.value);
          const unlocked = !!(check.unlocked || this.game.civilization.isUnlocked(option.value));
          option.textContent = `${planet?.emoji || ''} ${planet?.name || option.value}${unlocked ? ' · ✅ acceso' : check.can ? ' · ✓ listo' : ''}`;
        }
        const selected = this.game.civilization.canBuild(select.value);
        if (button) {
          button.textContent = selected.unlocked ? 'Acceso desbloqueado' : 'Desbloquear acceso';
          button.disabled = !!selected.unlocked;
        }
      }
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
