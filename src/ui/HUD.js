/**
 * HUD - Interfaz en juego.
 * Todo lo que toca el DOM está limitado en frecuencia y cacheado (solo se
 * escribe cuando cambia el valor) para no provocar recálculos de estilo cada frame.
 */
import * as THREE from 'three';
import { MATERIALS } from '../config/PlanetsConfig.js';
import { WEAPONS, WEAPON_ORDER } from '../config/ShopConfig.js';
import { isTouchUI } from '../utils/device.js';

const _proj = new THREE.Vector3();
const _closest = { planet: null, distance: 0 };

export class HUD {
  constructor() {
    this.elements = {};
    this.onPause = null;
    this._cache = {};
    this._textTimer = 0;
    this._mapTimer = 0;
    this._markerTimer = 0;
    this.touch = isTouchUI();
    this.markers = new Map();
    this._alertTimer = null;
    this._zoomTimer = null;
    try { this.init(); } catch (e) { console.error('[HUD] init error:', e); }
  }

  init() {
    const $ = (id) => document.getElementById(id);
    this.elements = {
      container: $('hud'),
      healthBar: $('health-bar'),
      healthText: $('health-text'),
      cargoBar: $('cargo-bar'),
      trashCount: $('trash-count'),
      trashCapacity: $('trash-capacity'),
      credits: $('hud-credits'),
      weaponChip: $('hud-weapon-chip'),
      weaponBar: $('hud-weapon-bar'),
      materials: $('hud-materials'),
      planetName: $('hud-planet'),
      objective: $('hud-objective'),
      alert: $('hud-alert'),
      minimap: $('minimap-canvas'),
      notifs: $('notifications'),
      crosshair: $('crosshair'),
      prompt: $('context-prompt'),
      promptKey: $('context-key'),
      promptText: $('context-text'),
      promptBar: $('context-progress-fill'),
      markers: $('hud-markers'),
      damage: $('damage-vignette'),
      zoomBtn: $('btn-zoom'),
      zoomIndicator: $('zoom-indicator'),
      pauseBtn: $('btn-pause'),
      speed: $('hud-speed'),
    };

    if (this.elements.minimap) {
      try {
        const size = this.touch ? 104 : 150;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        this.mapSize = size;
        this.elements.minimap.width = Math.round(size * dpr);
        this.elements.minimap.height = Math.round(size * dpr);
        this.elements.minimap.style.width = size + 'px';
        this.elements.minimap.style.height = size + 'px';
        this.minimapCtx = this.elements.minimap.getContext('2d');
        this.minimapCtx.scale(dpr, dpr);
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

  show() { this.elements.container?.classList.add('visible'); }
  hide() { this.elements.container?.classList.remove('visible'); }

  _setText(key, el, value) {
    if (!el || this._cache[key] === value) return;
    this._cache[key] = value;
    el.textContent = value;
  }

  _setHTML(key, el, value) {
    if (!el || this._cache[key] === value) return;
    this._cache[key] = value;
    el.innerHTML = value;
  }

  _setClass(key, el, value) {
    if (!el || this._cache[key] === value) return;
    this._cache[key] = value;
    el.className = value;
  }

  /**
   * ctx = { walle, solarSystem, trashSystem, refinery, enemySystem,
   *         asteroidSystem, taxi, water, camera, context, objective }
   */
  update(ctx, delta) {
    const { walle } = ctx;
    if (!walle) return;
    const el = this.elements;

    // Barras (baratas; cacheadas)
    const hp = Math.max(0, walle.health / walle.maxHealth);
    const hpW = `${Math.round(hp * 100)}%`;
    if (el.healthBar && this._cache.hpW !== hpW) {
      this._cache.hpW = hpW;
      el.healthBar.style.width = hpW;
    }
    this._setClass('hpCls', el.healthBar, 'bar-fill' + (hp < 0.3 ? ' danger' : ''));

    this._textTimer += delta;
    if (this._textTimer >= 0.1) {
      this._textTimer = 0;
      this._updateTexts(ctx);
    }

    this._markerTimer += delta;
    if (this._markerTimer >= 1 / 30) {
      this._markerTimer = 0;
      try { this._updateMarkers(ctx); } catch (e) { /* noop */ }
    }

    this._mapTimer += delta;
    if (this.minimapCtx && this._mapTimer >= 1 / 12) {
      this._mapTimer = 0;
      try { this._updateMinimap(ctx); } catch (e) { /* noop */ }
    }
  }

  _updateTexts(ctx) {
    const { walle, solarSystem, context } = ctx;
    const el = this.elements;
    this._setText('hp', el.healthText, String(Math.round(walle.health)));
    this._setText('trash', el.trashCount, String(walle.trashCount));
    this._setText('cap', el.trashCapacity, String(walle.trashCapacity));
    const cargo = walle.trashCount / Math.max(1, walle.trashCapacity);
    const cargoW = `${Math.round(cargo * 100)}%`;
    if (el.cargoBar && this._cache.cargoW !== cargoW) {
      this._cache.cargoW = cargoW;
      el.cargoBar.style.width = cargoW;
    }
    this._setClass('cargoCls', el.cargoBar, 'bar-fill cargo' + (cargo >= 1 ? ' full' : ''));
    this._setText('credits', el.credits, `${walle.credits} CR`);
    if (el.speed) this._setText('speed', el.speed, `${Math.round(walle.velocity.length())} u/s`);

    const w = WEAPONS[walle.weapon] || WEAPONS.laser;
    const ammo = walle.ammo[walle.weapon];
    const ammoTxt = ammo === Infinity ? '∞' : String(ammo);
    this._setText('weapon', el.weaponChip, `${w.icon} ${w.short} ${ammoTxt}`);

    // Barra de armas (PC): 1-4 con bloqueadas atenuadas
    if (el.weaponBar) {
      const html = WEAPON_ORDER.map((id) => {
        const def = WEAPONS[id];
        const owned = walle.weapons.includes(id);
        const a = walle.ammo[id];
        const cls = ['wslot', owned ? '' : 'locked', walle.weapon === id ? 'active' : ''].join(' ');
        return `<div class="${cls}"><b>${def.key}</b>${def.icon}<span>${owned ? (a === Infinity ? '∞' : a) : '🔒'}</span></div>`;
      }).join('');
      this._setHTML('wbar', el.weaponBar, html);
    }

    // Materiales a bordo (PC)
    if (el.materials && !this.touch) {
      const mats = Object.entries(walle.materials).filter(([, v]) => v > 0);
      const html = mats.length === 0
        ? '<div class="muted">Bodega vacía</div>'
        : mats.map(([k, v]) => {
          const m = MATERIALS[k] || { icon: '', name: k };
          return `<div class="material-row"><span>${m.icon} ${m.name}</span><span>${v}</span></div>`;
        }).join('');
      this._setHTML('mats', el.materials, html);
    }

    if (el.planetName && solarSystem) {
      const info = solarSystem.getClosestPlanetInfo(walle.position, _closest);
      if (info.planet) this._setText('planet', el.planetName, `${info.planet.config.emoji} ${info.planet.config.name} · ${Math.round(info.distance)} u`);
    }

    // Objetivo
    if (el.objective && ctx.objective !== undefined) this._setText('obj', el.objective, ctx.objective || '');

    // Indicador de acción contextual
    if (el.prompt) {
      if (context) {
        el.prompt.classList.remove('hidden');
        this._setText('pkey', el.promptKey, this.touch ? 'ACCIÓN' : context.key);
        this._setText('ptext', el.promptText, context.text);
        this._setClass('pcls', el.prompt, 'context-prompt ctx-' + context.type + (context.progress !== undefined ? ' has-progress' : ''));
        if (el.promptBar && context.progress !== undefined) {
          const pw = `${Math.round(context.progress * 100)}%`;
          if (this._cache.pbar !== pw) { this._cache.pbar = pw; el.promptBar.style.width = pw; }
        }
      } else if (this._cache.pcls !== 'hidden') {
        this._cache.pcls = 'hidden';
        this._cache.ptext = null;
        el.prompt.className = 'context-prompt hidden';
      }
    }
  }

  // ---------------------------------------------------------------- Marcadores

  _marker(id, cls) {
    let m = this.markers.get(id);
    if (!m) {
      const div = document.createElement('div');
      div.className = 'hud-marker ' + cls;
      div.innerHTML = '<i class="mk-arrow"></i><span class="mk-icon"></span><span class="mk-label"></span>';
      this.elements.markers.appendChild(div);
      m = { el: div, icon: div.querySelector('.mk-icon'), label: div.querySelector('.mk-label'), arrow: div.querySelector('.mk-arrow'), used: false, cache: {} };
      this.markers.set(id, m);
    }
    m.used = true;
    return m;
  }

  _placeMarker(m, worldPos, camera, icon, label) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    _proj.copy(worldPos).project(camera);
    const behind = _proj.z > 1;
    let x = _proj.x;
    let y = _proj.y;
    if (behind) { x = -x; y = -y; }
    const inside = !behind && Math.abs(x) < 0.92 && Math.abs(y) < 0.86;
    let sx;
    let sy;
    let angle = 0;
    if (inside) {
      sx = (x + 1) * 0.5 * W;
      sy = (1 - y) * 0.5 * H;
    } else {
      // Pegado al borde, con flecha hacia el objetivo
      angle = Math.atan2(-y, x);
      // Rectángulo útil: deja libres el panel de estado, los botones del
      // HUD (arriba, a la izquierda en PC y centrados en táctil) y el
      // minimapa; y en táctil los botones ▲▼ (izquierda) y el grupo de
      // acción (derecha).
      const left = this.touch ? 110 : 46;
      const right = W - (this.touch ? 120 : 46);
      const top = this.touch ? 128 : 150;
      const bottom = H - (this.touch ? 56 : 90);
      const cx = W / 2;
      const cy = H / 2;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const tx = c > 1e-6 ? (right - cx) / c : c < -1e-6 ? (left - cx) / c : Infinity;
      const ty = s > 1e-6 ? (bottom - cy) / s : s < -1e-6 ? (top - cy) / s : Infinity;
      const k = Math.max(0, Math.min(tx, ty));
      sx = cx + c * k;
      sy = cy + s * k;
    }
    const cls = inside ? 'on' : 'off';
    if (m.cache.cls !== cls) { m.cache.cls = cls; m.el.classList.toggle('edge', !inside); }
    m.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`;
    if (!inside) m.arrow.style.transform = `rotate(${angle}rad)`;
    if (m.cache.icon !== icon) { m.cache.icon = icon; m.icon.textContent = icon; }
    if (m.cache.label !== label) { m.cache.label = label; m.label.textContent = label; }
    if (m.el.style.display === 'none') m.el.style.display = '';
  }

  _updateMarkers(ctx) {
    const { walle, camera, taxi, refinery, asteroidSystem } = ctx;
    if (!this.elements.markers || !camera) return;
    for (const m of this.markers.values()) m.used = false;

    // Taxi-Mercader
    if (taxi) {
      const d = taxi.position.distanceTo(walle.position);
      if (d > 14) this._placeMarker(this._marker('taxi', 'mk-taxi'), taxi.position, camera, '🛒', `${Math.round(d)} u`);
    }

    if (refinery) {
      const wave = asteroidSystem && asteroidSystem.waveActive ? asteroidSystem.waveTarget : null;
      if (wave) {
        const d = wave.position.distanceTo(walle.position);
        this._placeMarker(this._marker('wave', 'mk-danger'), wave.position, camera, '☄️', `${wave.userData.short} · ${Math.round(d)} u`);
      }
      // Refinerías fuera de servicio (las 2 más cercanas)
      const offline = refinery.stations
        .filter(s => !s.userData.online && s !== wave)
        .map(s => ({ s, d: s.position.distanceTo(walle.position) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 2);
      offline.forEach((o, i) => {
        this._placeMarker(this._marker('off' + i, 'mk-repair'), o.s.position, camera, '🔧', `${o.s.userData.short} · ${Math.round(o.d)} u`);
      });
      // Refinería operativa más cercana si llevas carga
      if (walle.trashCount > 0 && walle.trashCount >= walle.trashCapacity * 0.5) {
        const near = refinery.getNearest(walle.position, undefined, s => s.userData.online);
        if (near.station && near.distance > 9 && near.station !== wave) {
          this._placeMarker(this._marker('dep', 'mk-refinery'), near.station.position, camera, '◆', `${Math.round(near.distance)} u`);
        }
      }
    }

    for (const m of this.markers.values()) {
      if (!m.used && m.el.style.display !== 'none') m.el.style.display = 'none';
    }
  }

  // ---------------------------------------------------------------- Minimapa

  _updateMinimap(ctx) {
    const { walle, solarSystem, trashSystem, refinery, enemySystem, asteroidSystem, taxi, water } = ctx;
    const g = this.minimapCtx;
    const S = this.mapSize;
    const C = S / 2;
    const R = C - 2;
    const scale = (this.touch ? 0.34 : 0.4);
    const yaw = walle.rotation.y;
    const sn = Math.sin(yaw);
    const cs = Math.cos(yaw);
    const px = walle.position.x;
    const pz = walle.position.z;
    // Minimapa orientado según el rumbo: arriba = hacia donde mira WALL·E
    const tx = (x, z) => {
      const dx = x - px;
      const dz = z - pz;
      const f = dx * sn + dz * cs;
      const r = -dx * cs + dz * sn;
      return [C + r * scale, C - f * scale];
    };
    const inside = (x, y, m = 0) => (x - C) * (x - C) + (y - C) * (y - C) <= (R - m) * (R - m);

    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath();
    g.arc(C, C, R, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = 'rgba(0,14,30,0.82)';
    g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(0,240,255,0.12)';
    g.lineWidth = 1;
    for (let i = 1; i <= 3; i++) { g.beginPath(); g.arc(C, C, (R / 3) * i, 0, Math.PI * 2); g.stroke(); }

    // Sol
    let [x, y] = tx(0, 0);
    g.fillStyle = '#ffcc33';
    g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();

    // Planetas
    if (solarSystem) {
      for (const p of solarSystem.planets) {
        [x, y] = tx(p.worldPosition.x, p.worldPosition.z);
        if (!inside(x, y, -8)) continue;
        g.fillStyle = '#' + p.config.color.toString(16).padStart(6, '0');
        g.beginPath(); g.arc(x, y, Math.max(2.5, p.config.radius * scale * 0.9), 0, Math.PI * 2); g.fill();
      }
    }

    // Basura cercana (amarillo) y agua (azul)
    if (trashSystem) {
      g.fillStyle = 'rgba(255,230,0,0.85)';
      const list = trashSystem.trashList;
      for (let i = 0; i < list.length; i++) {
        const t = list[i].mesh.position;
        [x, y] = tx(t.x, t.z);
        if (inside(x, y)) g.fillRect(x - 1, y - 1, 2, 2);
      }
    }
    if (water) {
      g.fillStyle = '#4fb8ff';
      for (const d of water.drops) {
        if (!d.alive) continue;
        [x, y] = tx(d.pos.x, d.pos.z);
        if (inside(x, y)) g.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
      }
    }

    // Refinerías (rombos; rojas si están fuera de servicio)
    if (refinery) {
      for (const st of refinery.stations) {
        [x, y] = tx(st.position.x, st.position.z);
        if (!inside(x, y, -4)) continue;
        const online = st.userData.online;
        g.fillStyle = online ? '#00f0ff' : '#ff3344';
        g.beginPath();
        g.moveTo(x, y - 4.5); g.lineTo(x + 4.5, y); g.lineTo(x, y + 4.5); g.lineTo(x - 4.5, y);
        g.closePath(); g.fill();
      }
    }

    // OVNIs
    if (enemySystem) {
      g.fillStyle = '#ff4455';
      for (const e of enemySystem.enemies) {
        const p = e.group.position;
        [x, y] = tx(p.x, p.z);
        if (inside(x, y)) { g.beginPath(); g.arc(x, y, e.config.id === 'mothership' ? 4 : 2.6, 0, Math.PI * 2); g.fill(); }
      }
    }

    // Asteroides (parpadean)
    if (asteroidSystem && asteroidSystem.asteroids.length) {
      const blink = (performance.now() % 500) < 300;
      g.fillStyle = blink ? '#ff9a3c' : '#ff5a1c';
      for (const a of asteroidSystem.asteroids) {
        const p = a.mesh.position;
        [x, y] = tx(p.x, p.z);
        const cx = Math.max(4, Math.min(S - 4, x));
        const cy = Math.max(4, Math.min(S - 4, y));
        if (inside(cx, cy, 3)) { g.beginPath(); g.arc(cx, cy, 3, 0, Math.PI * 2); g.fill(); }
      }
    }

    // Taxi (cuadrado amarillo con borde)
    if (taxi) {
      [x, y] = tx(taxi.position.x, taxi.position.z);
      if (!inside(x, y, 5)) {
        // En el borde para que siempre se sepa hacia dónde está
        const a = Math.atan2(y - C, x - C);
        x = C + Math.cos(a) * (R - 6);
        y = C + Math.sin(a) * (R - 6);
      }
      g.fillStyle = '#ffd000';
      g.strokeStyle = '#000';
      g.lineWidth = 1.5;
      g.fillRect(x - 4, y - 3, 8, 6);
      g.strokeRect(x - 4, y - 3, 8, 6);
    }

    g.restore();

    // Jugador (siempre en el centro, apuntando arriba)
    g.fillStyle = '#00f0ff';
    g.beginPath();
    g.moveTo(C, C - 7); g.lineTo(C + 5, C + 5); g.lineTo(C, C + 2); g.lineTo(C - 5, C + 5);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,240,255,0.5)';
    g.lineWidth = 1.5;
    g.beginPath(); g.arc(C, C, R, 0, Math.PI * 2); g.stroke();
  }

  // ---------------------------------------------------------------- Efectos

  notify(message, type = 'info') {
    const box = this.elements.notifs;
    if (!box) return;
    try {
      const last = box.lastElementChild;
      if (last && last.textContent === message) return;
      const div = document.createElement('div');
      div.className = 'notif notif-' + type;
      div.textContent = message;
      box.appendChild(div);
      const max = this.touch ? 3 : 5;
      while (box.children.length > max) box.removeChild(box.firstElementChild);
      setTimeout(() => { try { div.remove(); } catch (e) { /* noop */ } }, 3200);
    } catch (e) {
      console.error('[HUD] notify error:', e);
    }
  }

  /** Banner grande de alerta (lluvia de asteroides, refinería caída…). */
  alert(message, type = 'danger', duration = 4500) {
    const el = this.elements.alert;
    if (!el) return;
    el.textContent = message;
    el.className = 'alert-banner show alert-' + type;
    clearTimeout(this._alertTimer);
    this._alertTimer = setTimeout(() => { el.className = 'alert-banner'; }, duration);
  }

  flashDamage(strength = 1) {
    const el = this.elements.damage;
    if (!el) return;
    el.style.opacity = String(Math.min(0.85, 0.35 + strength * 0.03));
    clearTimeout(this._dmgTimer);
    this._dmgTimer = setTimeout(() => { el.style.opacity = '0'; }, 120);
  }

  shootEffect() {
    const c = this.elements.crosshair;
    if (!c) return;
    c.classList.add('shoot');
    clearTimeout(this._shootTimer);
    this._shootTimer = setTimeout(() => c.classList.remove('shoot'), 90);
  }

  /** Muestra el nivel de distancia de cámara (botón 👁 / rueda). */
  showZoom(zoom, label) {
    const btn = this.elements.zoomBtn;
    if (btn) {
      const idx = zoom > 0.8 ? 0 : zoom > 0.45 ? 1 : zoom > 0.12 ? 2 : 3;
      btn.dataset.level = String(idx);
    }
    const el = this.elements.zoomIndicator;
    if (!el) return;
    el.innerHTML = `<span>👁 ${label}</span><div class="zoom-track"><i style="width:${Math.round(zoom * 100)}%"></i></div>`;
    el.classList.add('show');
    clearTimeout(this._zoomTimer);
    this._zoomTimer = setTimeout(() => el.classList.remove('show'), 1100);
  }
}
