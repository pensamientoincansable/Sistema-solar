/**
 * CivUI - Panel del modo "Civilizar".
 *
 * Crea su propio DOM (barra superior de recursos, lista de edificios,
 * deslizadores de reparto de ciudadanos al estilo Rise of Nations, barra de
 * órdenes para los civiles seleccionados, panel del ayuntamiento, tutorial del
 * primer planeta y registro de sucesos) para no duplicar decenas de IDs en
 * index.html. Funciona igual en PC y en táctil: en pantallas bajas los paneles
 * se convierten en tiras.
 */
import {
  BUILDINGS, BUILD_ORDER, ERAS, PRIORITIES, CIV_BAR, GATHER_TASKS, GATHER_BY_RESOURCE,
  ROLE_PRIORITY, BALANCE,
} from '../civ/CivConfig.js';
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
    this._panelDirty = true;
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

      <div class="civ-dock" id="civ-dock">
        <div class="civ-panel civ-tut" id="civ-tut">
          <div class="civ-tut-bar">
            <span class="civ-tut-icon"></span>
            <b class="civ-tut-title"></b>
            <span class="civ-tut-progress"></span>
            <button class="civ-x" data-act="tut-close" type="button" title="Cerrar la guía">✕</button>
          </div>
          <p class="civ-tut-text"></p>
          <div class="civ-tut-foot">
            <button class="civ-btn primary" data-act="tut-next" type="button">Entendido ▸</button>
            <span class="civ-tut-note"></span>
          </div>
        </div>

        <div class="civ-panel civ-town" id="civ-town">
          <div class="civ-town-head">
            <span class="civ-town-icon"></span>
            <div class="civ-town-title"><b class="civ-town-name"></b><small class="civ-town-sub"></small></div>
            <button class="civ-x" data-act="close-panel" type="button" title="Cerrar">✕</button>
          </div>
          <div class="civ-town-body" id="civ-town-body"></div>
        </div>

        <div class="civ-panel civ-sel" id="civ-sel">
          <span class="civ-sel-count" id="civ-sel-count"></span>
          <div class="civ-orders" id="civ-orders"></div>
          <span class="civ-sel-tools">
            <button class="civ-btn" data-act="selectall" type="button" title="Seleccionar todos los civiles">☑️ Todos</button>
            <button class="civ-btn" data-act="release" type="button" title="Volver al reparto automático">↩️ Auto</button>
          </span>
        </div>
      </div>

      <div class="civ-bottom">
        <div class="civ-log" id="civ-log"></div>
        <div class="civ-actions">
          <button class="civ-btn" data-act="box" type="button" title="Arrastrar un recuadro para seleccionar varios civiles"><span>▭</span> Recuadro</button>
          <button class="civ-btn" data-act="guide" type="button"><span>📘</span> Guía</button>
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
      dock: root.querySelector('#civ-dock'),
      tut: root.querySelector('#civ-tut'),
      tutIcon: root.querySelector('.civ-tut-icon'),
      tutTitle: root.querySelector('.civ-tut-title'),
      tutProgress: root.querySelector('.civ-tut-progress'),
      tutText: root.querySelector('.civ-tut-text'),
      tutNote: root.querySelector('.civ-tut-note'),
      town: root.querySelector('#civ-town'),
      townIcon: root.querySelector('.civ-town-icon'),
      townName: root.querySelector('.civ-town-name'),
      townSub: root.querySelector('.civ-town-sub'),
      townBody: root.querySelector('#civ-town-body'),
      sel: root.querySelector('#civ-sel'),
      selCount: root.querySelector('#civ-sel-count'),
      orders: root.querySelector('#civ-orders'),
      boxBtn: root.querySelector('.civ-btn[data-act="box"]'),
      guideBtn: root.querySelector('.civ-btn[data-act="guide"]'),
    };

    // Un solo oyente para todos los botones: los paneles se reescriben a menudo
    // (innerHTML) y así no hay que volver a engancharlos cada vez.
    root.addEventListener('click', (e) => {
      const t = e.target;
      const btn = t && t.closest ? t.closest('[data-act]') : null;
      if (!btn || !root.contains(btn)) return;
      e.preventDefault();
      e.stopPropagation();
      this._action(btn.dataset.act, btn);
    });

    this._renderBuildList();
    this._renderPriorities();
    this._renderOrders();

    // Los eventos de la escena (selección, órdenes, tutorial) alimentan el panel.
    const prev = this.civ && this.civ.onEvent;
    this.civ.onEvent = (kind, data) => {
      try { this._onEvent(kind, data); } catch (e) { /* noop */ }
      if (typeof prev === 'function') prev(kind, data);
    };
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

  /** Botones de recolectar: uno por recurso que se puede explotar a mano. */
  _renderOrders() {
    this.els.orders.innerHTML = GATHER_TASKS.map((t) => `
      <button class="civ-order" data-res="${t.resource}" type="button" title="Mandar a recolectar ${t.name}">
        <span class="civ-order-icon">${t.icon}</span>
        <i>${t.name}</i>
      </button>`).join('');
    this.els.orders.querySelectorAll('.civ-order').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._order(btn.dataset.res);
      });
    });
  }

  // --------------------------------------------------------------- Eventos

  _onEvent(kind, data) {
    if (kind === 'select-units' || kind === 'select-building' || kind === 'box-mode' || kind === 'tutorial') {
      if (kind === 'tutorial') {
        if (data) this.log(`✅ Guía superada · siguiente: ${data.icon} ${data.title}`, 'success');
        else this.log('🎉 ¡Guía de construcción completada! Ya sabes hacer crecer la colonia', 'success');
      }
      this._panelDirty = true;
      this.refresh(0, true);
      return;
    }
    if (kind === 'command') {
      if (data && data.ok) {
        const t = GATHER_BY_RESOURCE[data.resource];
        this.log(`${t ? t.icon : '📦'} ${data.count} ${data.count === 1 ? 'civil va' : 'civiles van'} a por ${t ? t.name : data.resource}`, 'success');
      } else if (data && data.reason) {
        this.log(`⚠️ ${data.reason}`, 'warn');
      }
      return;
    }
    if (kind === 'node') {
      const t = data && data.resource ? GATHER_BY_RESOURCE[data.resource] : null;
      if (t) this.log(`${t.icon} ${t.name}: selecciona civiles y toca el yacimiento (o usa la barra de órdenes)`, 'info');
      return;
    }
    if (kind === 'built') this._panelDirty = true;
  }

  // ---------------------------------------------------------------- Acciones

  _action(act, btn) {
    const c = this.civ.colony;
    if (act === 'exit') { if (this.hooks.onExit) this.hooks.onExit(); return; }
    if (act === 'center') { this.civ.resetView(); return; }
    if (act === 'box') { this.civ.setBoxMode(!this.civ.boxMode); this.refresh(0, true); return; }
    if (act === 'selectall') { this.civ.selectAllUnits(); this.refresh(0, true); return; }
    if (act === 'release') {
      const r = this.civ.releaseSelected();
      if (!r.ok && r.reason) this.log(`⚠️ ${r.reason}`, 'warn');
      this.refresh(0, true);
      return;
    }
    if (act === 'guide') {
      const t = this.civ.tutorial;
      if (!t) { this.log('📘 La guía solo aparece en el primer planeta civilizado', 'info'); return; }
      if (t.step) this.log(`📘 Guía: ${t.step.title}`, 'info');
      this.refresh(0, true);
      return;
    }
    if (act === 'tut-next') {
      const t = this.civ.tutorial;
      if (t) t.advance();
      this.refresh(0, true);
      return;
    }
    if (act === 'tut-close') {
      const t = this.civ.tutorial;
      if (t) t.dismiss();
      this.refresh(0, true);
      return;
    }
    if (act === 'close-panel') { this.civ.selectBuilding(this.civ.selectedBuilding); this.refresh(0, true); return; }
    if (act === 'train') { this._train(); return; }
    if (act === 'cancel-build') {
      const b = this.civ.colony ? this.civ.colony.buildings.find(x => x.uid === this.civ.selectedBuilding) : null;
      if (b) this.civ.colony.cancelBuild(b.uid);
      this.civ.selectBuilding(b ? b.uid : this.civ.selectedBuilding);
      this._panelDirty = true;
      this.refresh(0, true);
      return;
    }
    if (!c) return;
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

  /** Manda la selección a recolectar un recurso concreto. */
  _order(resource) {
    const c = this.civ.colony;
    if (!c) return;
    if (!this.civ.selection || !this.civ.selection.size) {
      const t = GATHER_BY_RESOURCE[resource];
      this.log(`👆 Toca civiles para seleccionarlos antes de mandarlos a por ${t ? t.name : resource}`, 'warn');
      this.civ.selectAllUnits();
      this.log('☑️ Seleccionados todos los civiles: vuelve a pulsar la orden', 'info');
      return;
    }
    const r = this.civ.commandSelected(resource);
    if (!r.ok) this.log(`⚠️ ${r.reason}`, 'warn');
    this.refresh(0, true);
  }

  /** Entrena un civil nuevo en el ayuntamiento. */
  _train() {
    const c = this.civ.colony;
    if (!c) return;
    const r = c.trainCitizen();
    if (r.ok) this.log(`🏛️ Nuevo ${c.theme.singular} en camino… (${c.population}/${c.popCap})`, 'success');
    else this.log(`⚠️ ${r.reason}`, 'warn');
    this.refresh(0, true);
  }

  // ------------------------------------------------------------------ Bucle

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
      const label = r === 'citizen' ? c.theme.singular : null;
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

    // Paneles flotantes: selección, edificio y tutorial
    this._refreshSelection(c);
    this._refreshTown(c);
    this._refreshTutorial(c);
    this._panelDirty = false;
  }

  /** Barra de órdenes: siempre visible, con las 6 formas de recolectar. */
  _refreshSelection(c) {
    const sel = this.civ.selectedUnits ? this.civ.selectedUnits() : [];
    const n = sel.length;
    this.els.sel.classList.toggle('empty', n === 0);
    const manual = sel.filter(u => u.manual).length;
    this._setHTML('selCount', this.els.selCount, n
      ? `👥 <b>${n}</b> seleccionado${n === 1 ? '' : 's'}${manual ? ` · ${manual} con orden` : ''}`
      : '👥 Toca un civil (o ▭ Recuadro) para dar órdenes');
    const orders = this.els.orders.querySelectorAll('.civ-order');
    orders.forEach((btn) => {
      const res = btn.dataset.res;
      const t = GATHER_BY_RESOURCE[res];
      const check = c.gatherTarget(res);
      btn.classList.toggle('off', !check.ok);
      btn.disabled = !check.ok;
      btn.title = check.ok
        ? `Mandar a recolectar ${t.name}`
        : `${t.name}: ${check.reason}`;
      btn.classList.toggle('active', sel.some(u => u.manual && u.task && u.task.resource === res));
    });
    this.els.boxBtn.classList.toggle('active', !!this.civ.boxMode);
  }

  /** Panel del edificio seleccionado (ayuntamiento = crear civiles). */
  _refreshTown(c) {
    const info = this.civ.selectedBuildingInfo ? this.civ.selectedBuildingInfo() : null;
    if (this.els.town) this.els.town.classList.toggle('on', !!info);
    if (!info) return;
    const def = info.def;
    this._setHTML('townIcon', this.els.townIcon, def.icon);
    this._setText('townName', this.els.townName, def.name);
    this._setHTML('townSub', this.els.townSub,
      `${ERAS[def.era] ? ERAS[def.era].icon : ''} ${ERAS[def.era] ? ERAS[def.era].name : ''} · ❤️ ${info.hp}%${info.progress < 1 ? ' · en obras' : ''}`);
    this._setHTML('townBody', this.els.townBody, this._townBody(c, info));
  }

  _townBody(c, info) {
    const def = info.def;
    const rows = [];
    if (info.progress < 1) {
      const pct = Math.round(info.progress * 100);
      rows.push(`<div class="civ-bar"><i style="width:${pct}%"></i></div>`);
      rows.push(`<div class="civ-town-row"><span>🚧 Obra al ${pct}%</span><span>👷 ${info.workers} · 🖐 ${info.manual}</span></div>`);
      rows.push(`<button class="civ-btn danger" data-act="cancel-build" type="button">↩️ Cancelar (50% devuelto)</button>`);
    } else if (def.role) {
      rows.push(`<div class="civ-town-row"><span>👷 Trabajadores</span><b>${info.workers}</b></div>`);
      if (info.manual) rows.push(`<div class="civ-town-row"><span>🖐 Recolectando a mano</span><b>${info.manual}</b></div>`);
      const p = PRIORITIES[ROLE_PRIORITY[def.role]];
      if (p) rows.push(`<div class="civ-town-note">Sube «${p.icon} ${p.name}» en el reparto para tener más ${UNIT_NAME[def.role]}</div>`);
    } else if (def.guards) {
      rows.push(`<div class="civ-town-row"><span>🛡️ Guardias posibles</span><b>${def.guards}</b></div>`);
    }

    // El ayuntamiento además entrena civiles
    if (def.id === 'center') {
      const full = c.population >= c.popCap;
      const food = Math.floor(c.storage.food || 0);
      const busy = c.trainTimer > 0;
      const pct = busy ? Math.round((1 - c.trainTimer / BALANCE.trainTime) * 100) : 0;
      rows.push(`<div class="civ-town-row"><span>👥 Población</span><b>${c.population}/${c.popCap}</b></div>`);
      if (busy) {
        rows.push(`<div class="civ-bar train"><i style="width:${pct}%"></i></div>`);
        rows.push(`<div class="civ-town-note">🏛️ Llega un ${c.theme.singular} en ${c.trainTimer.toFixed(1)} s…</div>`);
      }
      rows.push(`<button class="civ-btn primary wide" data-act="train" type="button" ${busy || full || food < BALANCE.trainFood ? 'disabled' : ''}>
        ➕ Nuevo ${c.theme.singular} <em>🍞 ${BALANCE.trainFood}</em></button>`);
      rows.push(full
        ? `<div class="civ-town-note warn">🏠 Límite alcanzado: cada vivienda suma +${BUILDINGS.house.popCap} de población</div>`
        : food < BALANCE.trainFood
          ? `<div class="civ-town-note warn">🍞 Falta alimento (${food}/${BALANCE.trainFood}): construye una granja 🌾</div>`
          : `<div class="civ-town-note">Tarda ${BALANCE.trainTime} s · el límite sube con viviendas 🏠</div>`);
    }
    return rows.join('');
  }

  /** Tutorial del primer planeta. */
  _refreshTutorial(c) {
    const t = this.civ.tutorial;
    // La guía es del primer planeta aterrizado: en los demás no se muestra.
    const step = (t && (!t.planetId || t.planetId === c.planetId)) ? t.step : null;
    if (this.els.tut) this.els.tut.classList.toggle('on', !!step);
    if (this.els.guideBtn) this.els.guideBtn.classList.toggle('active', !step && !!t && !t.done && !!t.planetId && t.planetId === c.planetId);
    if (!step) return;
    this._setHTML('tutIcon', this.els.tutIcon, step.icon);
    this._setText('tutTitle', this.els.tutTitle, step.title);
    this._setText('tutProgress', this.els.tutProgress, t.progress);
    this._setHTML('tutText', this.els.tutText, step.text);
    this._setHTML('tutNote', this.els.tutNote,
      c.planet ? `Guía de ${c.name} · se cierra sola al completarla` : 'Guía de construcción');
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
