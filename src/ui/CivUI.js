/**
 * CivUI - Panel del modo "Civilizar".
 *
 * Crea su propio DOM (barra superior de recursos, lista de edificios,
 * deslizadores de reparto de ciudadanos al estilo Rise of Nations y registro de
 * sucesos) para no duplicar decenas de IDs en index.html. Funciona igual en PC
 * y en táctil: en pantallas bajas los paneles se convierten en tiras.
 */
import { BUILDINGS, BUILD_ORDER, ERAS, PRIORITIES, CIV_BAR } from '../civ/CivConfig.js';
import { MATERIALS } from '../config/PlanetsConfig.js';

const RES = (id) => MATERIALS[id] || { icon: '•', name: id, color: '#fff' };

export class CivUI {
  constructor(civ, hooks = {}) {
    this.civ = civ;
    this.hooks = hooks;
    this.visible = false;
    this.root = null;
    this.els = {};
    this._cache = {};
    this._timer = 0;
    this._logLines = [];
    try { this._build(); } catch (e) { console.error('[CivUI] init error:', e); }
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'civ-ui';
    root.className = 'civ-ui';
    root.innerHTML = `
      <div class="civ-top">
        <div class="civ-head">
          <div class="civ-planet"><span class="civ-emoji"></span><b class="civ-name"></b></div>
          <div class="civ-era"><span class="civ-era-icon"></span><span class="civ-era-name"></span></div>
        </div>
        <div class="civ-res" id="civ-res"></div>
        <div class="civ-stats">
          <span class="civ-chip pop" title="Población">👥 <b class="civ-pop"></b></span>
          <span class="civ-chip def" title="Defensa">🛡️ <b class="civ-def"></b></span>
          <span class="civ-chip time" title="Tiempo de la colonia">⏱️ <b class="civ-time"></b></span>
        </div>
      </div>

      <div class="civ-left">
        <h4>🏗️ Construir</h4>
        <div class="civ-build-list" id="civ-build-list"></div>
        <div class="civ-hint" id="civ-hint"></div>
      </div>

      <div class="civ-right">
        <h4>👷 Reparto de ciudadanos</h4>
        <div class="civ-prio" id="civ-prio"></div>
        <h4>🧭 Colonia</h4>
        <div class="civ-units" id="civ-units"></div>
      </div>

      <div class="civ-bottom">
        <div class="civ-log" id="civ-log"></div>
        <div class="civ-actions">
          <button class="civ-btn" data-act="era" type="button"><span>⬆️</span> Avanzar de era</button>
          <button class="civ-btn" data-act="export" type="button"><span>🚀</span> Enviar a la órbita</button>
          <button class="civ-btn" data-act="center" type="button"><span>🎥</span> Centrar vista</button>
          <button class="civ-btn primary" data-act="exit" type="button"><span>🛰️</span> Volar (G / Esc)</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    this.root = root;

    this.els = {
      emoji: root.querySelector('.civ-emoji'),
      name: root.querySelector('.civ-name'),
      eraIcon: root.querySelector('.civ-era-icon'),
      eraName: root.querySelector('.civ-era-name'),
      res: root.querySelector('#civ-res'),
      pop: root.querySelector('.civ-pop'),
      def: root.querySelector('.civ-def'),
      time: root.querySelector('.civ-time'),
      buildList: root.querySelector('#civ-build-list'),
      prio: root.querySelector('#civ-prio'),
      units: root.querySelector('#civ-units'),
      log: root.querySelector('#civ-log'),
      hint: root.querySelector('#civ-hint'),
    };

    root.querySelectorAll('.civ-btn[data-act]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this._action(btn.dataset.act);
      });
    });

    this._renderBuildList();
    this._renderPriorities();
  }

  // ------------------------------------------------------------- Listas base

  _renderBuildList() {
    const html = BUILD_ORDER.map((id) => {
      const def = BUILDINGS[id];
      const cost = Object.entries(def.cost)
        .map(([r, v]) => `<i data-cost="${r}">${RES(r).icon}${v}</i>`).join('');
      return `<button class="civ-item" data-type="${id}" type="button">
        <span class="civ-item-icon">${def.icon}</span>
        <span class="civ-item-body">
          <b>${def.name}</b>
          <small>${def.desc}</small>
          <em>${cost || '<i>gratis</i>'}</em>
        </span>
        <span class="civ-item-era">${def.era > 0 ? ERAS[def.era].icon : ''}</span>
      </button>`;
    }).join('');
    this.els.buildList.innerHTML = html;
    this.els.buildList.querySelectorAll('.civ-item').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const type = btn.dataset.type;
        if (this.civ.pendingType === type) this.civ.setPendingBuild(null);
        else this.civ.setPendingBuild(type);
        this.refresh(0, true);
      });
    });
  }

  _renderPriorities() {
    this.els.prio.innerHTML = Object.values(PRIORITIES).map((p) => `
      <label class="civ-slider" data-key="${p.key}">
        <span>${p.icon} ${p.name}</span>
        <input type="range" min="0" max="10" step="1" value="${p.default}" aria-label="Prioridad de ${p.name}" />
        <output>${p.default}</output>
      </label>`).join('');
    this.els.prio.querySelectorAll('.civ-slider input').forEach((input) => {
      const key = input.closest('.civ-slider').dataset.key;
      const out = input.parentElement.querySelector('output');
      input.addEventListener('input', () => {
        const v = Number(input.value);
        out.textContent = String(v);
        if (this.civ.colony) {
          this.civ.colony.priority[key] = v;
          this.civ.colony.assignWork();
        }
      });
    });
  }

  // ------------------------------------------------------------------ Acciones

  _action(act) {
    const c = this.civ.colony;
    if (!c) return;
    if (act === 'exit') { if (this.hooks.onExit) this.hooks.onExit(); return; }
    if (act === 'center') { this.civ.resetView(); return; }
    if (act === 'era') {
      const r = c.advanceEra();
      if (this.hooks.onNotify) this.hooks.onNotify(r.ok ? `⬆️ ${ERAS[c.era].name}: ${ERAS[c.era].desc}` : r.reason, r.ok ? 'success' : 'danger');
      this.refresh(0, true);
      return;
    }
    if (act === 'export') {
      const r = c.exportToOrbit();
      if (this.hooks.onExport) this.hooks.onExport(r);
      this.refresh(0, true);
    }
  }

  // -------------------------------------------------------------------- Bucle

  show() {
    if (!this.root) return;
    this.visible = true;
    this.root.classList.add('visible');
    this.refresh(0, true);
  }

  hide() {
    if (!this.root) return;
    this.visible = false;
    this.root.classList.remove('visible');
    this.civ.setPendingBuild(null);
  }

  log(message, type = 'info') {
    if (!this.els.log) return;
    this._logLines.unshift({ message, type });
    if (this._logLines.length > 6) this._logLines.pop();
    this.els.log.innerHTML = this._logLines
      .map((l, i) => `<div class="civ-log-line lvl-${l.type}" style="opacity:${1 - i * 0.14}">${l.message}</div>`).join('');
  }

  clearLog() { this._logLines = []; if (this.els.log) this.els.log.innerHTML = ''; }

  /** delta: para limitar el refresco del DOM a ~8 veces por segundo. */
  refresh(delta, force = false) {
    if (!this.visible || !this.root) return;
    this._timer += delta || 0;
    if (!force && this._timer < 0.12) return;
    this._timer = 0;
    const c = this.civ.colony;
    if (!c) return;

    const planet = this.civ.planet;
    this._setText('name', this.els.name, c.name);
    this._setText('emoji', this.els.emoji, planet ? planet.config.emoji : '🪐');
    const era = ERAS[c.era] || ERAS[0];
    this._setText('eraIcon', this.els.eraIcon, era.icon);
    this._setText('eraName', this.els.eraName, era.name);
    this._setText('pop', this.els.pop, `${c.population}/${c.popCap}`);
    this._setText('def', this.els.def, String(c.defense));
    const mins = Math.floor(c.age / 60);
    const secs = Math.floor(c.age % 60);
    this._setText('time', this.els.time, `${mins}:${String(secs).padStart(2, '0')}`);

    // Recursos con su tasa por segundo
    const rates = c.getRates();
    const resHtml = CIV_BAR.map((id) => {
      const m = RES(id);
      const v = Math.floor(c.storage[id] || 0);
      const r = rates[id] || 0;
      const sign = r > 0.005 ? '+' : r < -0.005 ? '' : '±';
      const cls = r > 0.005 ? 'up' : r < -0.005 ? 'down' : '';
      return `<div class="civ-res-item" style="--c:${m.color}"><b>${m.icon} ${v}</b><i class="${cls}">${sign}${r.toFixed(1)}/s</i></div>`;
    }).join('');
    this._setHTML('res', this.els.res, resHtml);

    // Edificios: disponibles, bloqueados por era o sin recursos
    this.els.buildList.querySelectorAll('.civ-item').forEach((btn) => {
      const type = btn.dataset.type;
      const def = BUILDINGS[type];
      const check = c.canBuild(type);
      const atMax = c.countType(type) >= def.max;
      btn.classList.toggle('selected', this.civ.pendingType === type);
      btn.classList.toggle('locked', !check.ok);
      btn.classList.toggle('maxed', atMax);
      const eraBadge = btn.querySelector('.civ-item-era');
      if (eraBadge) {
        eraBadge.textContent = def.era > c.era ? `🔒 ${ERAS[def.era].icon}` : `${c.countType(type)}/${def.max}`;
      }
      btn.querySelectorAll('[data-cost]').forEach((el) => {
        const r = el.dataset.cost;
        const need = def.cost[r];
        el.classList.toggle('lack', (c.storage[r] || 0) < need);
      });
    });

    // Deslizadores (solo si han cambiado desde fuera)
    this.els.prio.querySelectorAll('.civ-slider').forEach((row) => {
      const key = row.dataset.key;
      const input = row.querySelector('input');
      const out = row.querySelector('output');
      if (Number(input.value) !== c.priority[key]) {
        input.value = String(c.priority[key]);
        out.textContent = String(c.priority[key]);
      }
    });

    // Reparto actual de peones
    const roles = ['builder', 'farmer', 'logger', 'miner', 'scholar', 'guard', 'citizen'];
    const counts = {};
    for (const u of c.units) counts[u.role] = (counts[u.role] || 0) + 1;
    const unitHtml = roles.map((r) => {
      const n = counts[r] || 0;
      if (!n) return '';
      const label = r === 'citizen' ? this.civ.colony.theme.singular : null;
      return `<span class="civ-unit">${UNIT_ICON[r]} ${label || UNIT_NAME[r]} <b>${n}</b></span>`;
    }).join('');
    this._setHTML('units', this.els.units, unitHtml || '<span class="muted">Sin ciudadanos</span>');

    // Pista de construcción
    let hint = '';
    if (this.civ.pendingType) {
      const def = BUILDINGS[this.civ.pendingType];
      hint = `Toca el terreno para colocar ${def.icon} <b>${def.name}</b> · toca otra vez el botón para cancelar`;
    } else if (c.raid.active) {
      hint = `☄️ ${c.raid.name}: poder ${c.raid.power} · defensa ${c.defense}`;
    } else if (c.hunger > 4) {
      hint = '⚠️ Falta alimento: construye granjas 🌾';
    } else {
      hint = 'Elige un edificio y toca el terreno · arrastra para girar la cámara · rueda/pellizco para zoom';
    }
    this._setHTML('hint', this.els.hint, hint);

    // Botones de acción
    const eraBtn = this.root.querySelector('.civ-btn[data-act="era"]');
    if (eraBtn) {
      const next = ERAS[c.era + 1];
      const can = c.canAdvanceEra();
      eraBtn.disabled = !can.ok;
      const label = next ? `${next.icon} ${next.name} · 📚${next.knowledge}` : 'Era máxima';
      this._setText('eraBtn', eraBtn, label, (el, v) => { el.lastChild.textContent = ' ' + v; });
    }
    const expBtn = this.root.querySelector('.civ-btn[data-act="export"]');
    if (expBtn) expBtn.disabled = !c.hasSpaceport();
  }

  _setText(key, el, value, apply) {
    if (!el || this._cache[key] === value) return;
    this._cache[key] = value;
    if (apply) apply(el, value);
    else el.textContent = value;
  }

  _setHTML(key, el, value) {
    if (!el || this._cache[key] === value) return;
    this._cache[key] = value;
    el.innerHTML = value;
  }
}

const UNIT_ICON = {
  builder: '👷', farmer: '🧑‍🌾', logger: '🪓', miner: '⛏️', scholar: '🔬', guard: '🛡️', citizen: '🧑',
};
const UNIT_NAME = {
  builder: 'constructores', farmer: 'granjeros', logger: 'leñadores', miner: 'mineros',
  scholar: 'investigadores', guard: 'guardias', citizen: 'colonos',
};
