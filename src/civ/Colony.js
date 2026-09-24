/**
 * Colony - Simulación de una civilización en la superficie de un planeta.
 *
 * Lógica pura (sin three.js) para poder serializarla en la partida guardada y
 * probarla en Node. El aspecto 3D lo pone CivMode.js, que solo refleja aquí.
 *
 * Inspiración: Rise of Nations (reparto de ciudadanos por recurso con
 * deslizadores) y Civilization (eras, crecimiento, edificios e incursiones).
 */
import {
  BALANCE, BUILDINGS, ERAS, GRID, TILE, CITY_RADIUS, PRIORITIES, ROLE_PRIORITY,
  UNIT_TYPES, planetCiv, yieldFactor,
} from './CivConfig.js';

const _r = (min, max) => min + Math.random() * (max - min);

/** Convierte coordenadas de tile a coordenadas locales del asentamiento. */
export function tileToLocal(tx, tz) {
  const half = (GRID - 1) / 2;
  return { x: (tx - half) * TILE, z: (tz - half) * TILE };
}

export function localToTile(x, z) {
  const half = (GRID - 1) / 2;
  return { tx: Math.round(x / TILE + half), tz: Math.round(z / TILE + half) };
}

export function inGrid(tx, tz) {
  return tx >= 0 && tz >= 0 && tx < GRID && tz < GRID;
}

export class Colony {
  constructor(planetId, options = {}) {
    this.planetId = planetId;
    this.theme = planetCiv(planetId);
    this.name = options.name || this.theme.demonym;
    this.uidSeq = 1;
    this.age = 0;
    this.era = 0;
    this.storage = { ...BALANCE.startStorage };
    this.buildings = [];
    this.nodes = [];
    this.units = [];
    this.priority = {};
    Object.keys(PRIORITIES).forEach(k => { this.priority[k] = PRIORITIES[k].default; });
    this.raid = { timer: BALANCE.raidFirst, active: false, time: 0, power: 0, name: '' };
    this.hunger = 0;
    this.growthTimer = 0;
    this.stats = { gathered: {}, built: 0, raids: 0, raidsRepelled: 0, lost: 0, exported: 0, buildingsLost: 0 };
    this.events = [];
    this._assignTimer = 0;
    this._warned = {};

    this._createCenter();
    this._generateNodes(options.nodeSeed || 0);
    for (let i = 0; i < BALANCE.startCitizens; i++) this.spawnUnit('citizen');
    for (let i = 0; i < BALANCE.startBuilders; i++) this.spawnUnit('builder');
  }

  // ------------------------------------------------------------------ Fábrica

  static create(planetId, options) { return new Colony(planetId, options); }

  _nextUid() { return this.uidSeq++; }

  _createCenter() {
    const center = this._makeBuilding('center', (GRID - 1) / 2, (GRID - 1) / 2);
    center.progress = 1;
    this.buildings.push(center);
    return center;
  }

  _makeBuilding(type, tx, tz) {
    const def = BUILDINGS[type];
    const p = tileToLocal(tx, tz);
    return {
      uid: this._nextUid(), type, tx, tz, x: p.x, z: p.z,
      progress: def.buildTime > 0 ? 0 : 1,
      hp: 100, workers: 0, node: null, guardTimer: 0,
    };
  }

  /** Reparte los yacimientos del planeta alrededor del centro. */
  _generateNodes() {
    const theme = this.theme;
    const counts = theme.nodes || { vein: 3, forest: 2, crystal: 1 };
    const push = (kind, resource, amount) => {
      const spot = this._randomSpot(16, CITY_RADIUS + 6);
      this.nodes.push({
        uid: this._nextUid(), kind, resource,
        x: spot.x, z: spot.z, amount, maxAmount: amount,
      });
    };
    for (let i = 0; i < (counts.vein || 0); i++) push('vein', 'metal', 900 + Math.round(_r(0, 500)));
    for (let i = 0; i < (counts.forest || 0); i++) push('forest', 'wood', 700 + Math.round(_r(0, 400)));
    for (let i = 0; i < (counts.crystal || 0); i++) push('crystal', 'crystal', 320 + Math.round(_r(0, 220)));
    // Un filón de piedra siempre disponible (el hormigón/regolito es universal)
    push('vein', 'stone', 1100);
    // Cada filón de piedra puede ser de metal: se garantiza al menos 2 de metal
    const metal = this.nodes.filter(n => n.resource === 'metal').length;
    for (let i = metal; i < 2; i++) push('vein', 'metal', 900);
  }

  _randomSpot(minR, maxR) {
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = _r(minR, maxR);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const far = this.nodes.every(n => (n.x - x) ** 2 + (n.z - z) ** 2 > 100);
      if (far) return { x, z };
    }
    const a = Math.random() * Math.PI * 2;
    return { x: Math.cos(a) * minR, z: Math.sin(a) * minR };
  }

  // ------------------------------------------------------------------- Estado

  get population() { return this.units.length; }

  get popCap() {
    let cap = 0;
    for (const b of this.buildings) {
      if (b.progress < 1) continue;
      cap += (BUILDINGS[b.type] && BUILDINGS[b.type].popCap) || 0;
    }
    return cap;
  }

  get defense() {
    let d = 0;
    for (const b of this.buildings) {
      if (b.progress < 1) continue;
      d += (BUILDINGS[b.type] && BUILDINGS[b.type].defense) || 0;
    }
    d += this.units.filter(u => u.role === 'guard').length * 10;
    return Math.round(d);
  }

  get eraBonus() { return (ERAS[this.era] && ERAS[this.era].bonus) || 1; }

  get foodRate() { return this.population * BALANCE.foodPerCitizen; }

  countType(type) { return this.buildings.filter(b => b.type === type).length; }

  hasSpaceport() { return this.buildings.some(b => b.type === 'spaceport' && b.progress >= 1); }

  buildingAt(tx, tz) { return this.buildings.find(b => b.tx === tx && b.tz === tz) || null; }

  findBuilding(type) { return this.buildings.find(b => b.type === type) || null; }

  /** Producción por segundo de cada recurso (para la interfaz). */
  getRates() {
    const rates = { food: 0, wood: 0, stone: 0, metal: 0, energy: 0, crystal: 0, knowledge: 0 };
    for (const b of this.buildings) {
      if (b.progress < 1) continue;
      const def = BUILDINGS[b.type];
      if (!def || !def.produces || !b.workers) continue;
      const nodeFactor = this._nodeFactor(b, def);
      for (const res of Object.keys(def.produces)) {
        rates[res] = (rates[res] || 0) + def.produces[res] * b.workers * this.eraBonus
          * yieldFactor(this.planetId, res) * nodeFactor;
      }
    }
    rates.food -= this.foodRate;
    for (const k of Object.keys(rates)) rates[k] = Math.round(rates[k] * 100) / 100;
    return rates;
  }

  _nodeFactor(building, def) {
    if (!def.needsNode) return 1;
    const node = this.nodes.find(n => n.uid === building.node);
    if (!node) return 0;
    return node.amount > 0 ? 1 : 0;
  }

  /** Enlaza un edificio con el yacimiento útil más cercano. */
  _linkNode(building, def) {
    if (!def || !def.needsNode) return;
    let best = null;
    let bestD = Infinity;
    for (const n of this.nodes) {
      const kindOk = def.needsNode === 'vein'
        ? (n.kind === 'vein' || n.kind === 'crystal')
        : n.kind === def.needsNode;
      if (!kindOk) continue;
      const d = (n.x - building.x) ** 2 + (n.z - building.z) ** 2;
      if (d < bestD) { bestD = d; best = n; }
    }
    building.node = best ? best.uid : null;
    if (!best) this.pushEvent(`⚠️ No hay ${def.needsNode === 'forest' ? 'bosque' : 'filón'} cerca de ${def.name}`, 'warn');
  }

  // ------------------------------------------------------------- Construcción

  canBuild(type, tx, tz) {
    const def = BUILDINGS[type];
    if (!def) return { ok: false, reason: 'Edificio desconocido' };
    if (def.era > this.era) return { ok: false, reason: `Requiere la era ${ERAS[def.era].name}` };
    if (this.countType(type) >= def.max) return { ok: false, reason: `Máximo ${def.max} de ${def.name}` };
    if (tx !== undefined) {
      if (!inGrid(tx, tz)) return { ok: false, reason: 'Fuera del asentamiento' };
      const p = tileToLocal(tx, tz);
      if (Math.hypot(p.x, p.z) > CITY_RADIUS) return { ok: false, reason: 'Demasiado lejos del centro' };
      if (this.buildingAt(tx, tz)) return { ok: false, reason: 'Ya hay algo construido ahí' };
      for (const n of this.nodes) {
        if ((n.x - p.x) ** 2 + (n.z - p.z) ** 2 < 9) return { ok: false, reason: 'Hay un yacimiento en esa casilla' };
      }
    }
    for (const res of Object.keys(def.cost)) {
      if ((this.storage[res] || 0) < def.cost[res]) {
        return { ok: false, missing: res, need: def.cost[res], have: Math.floor(this.storage[res] || 0) };
      }
    }
    return { ok: true, def };
  }

  /** Busca la mejor casilla libre para un tipo (cerca de su yacimiento). */
  findSpot(type) {
    const def = BUILDINGS[type];
    if (!def) return null;
    const center = this.findBuilding('center');
    const anchors = [];
    if (def.needsNode) {
      for (const n of this.nodes) {
        const kindOk = def.needsNode === 'vein' ? (n.kind === 'vein' || n.kind === 'crystal') : n.kind === def.needsNode;
        if (kindOk) anchors.push(n);
      }
    }
    if (!anchors.length && center) anchors.push(center);
    let best = null;
    let bestScore = Infinity;
    for (let tx = 0; tx < GRID; tx++) {
      for (let tz = 0; tz < GRID; tz++) {
        if (!this.canBuild(type, tx, tz).ok) continue;
        const p = tileToLocal(tx, tz);
        let d = Math.hypot(p.x, p.z);
        for (const a of anchors) d = Math.min(d, Math.hypot(p.x - a.x, p.z - a.z));
        const score = d + Math.random() * 1.5;
        if (score < bestScore) { bestScore = score; best = { tx, tz }; }
      }
    }
    return best;
  }

  build(type, tx, tz) {
    let spot = { tx, tz };
    if (tx === undefined || tz === undefined) spot = this.findSpot(type);
    if (!spot) return { ok: false, reason: 'No hay sitio libre' };
    const check = this.canBuild(type, spot.tx, spot.tz);
    if (!check.ok) return check;
    const def = check.def;
    for (const res of Object.keys(def.cost)) this.storage[res] -= def.cost[res];
    const b = this._makeBuilding(type, spot.tx, spot.tz);
    this._linkNode(b, def);
    this.buildings.push(b);
    this.stats.built++;
    this.pushEvent(`🏗️ ${def.icon} ${def.name} en construcción`, 'info');
    return { ok: true, building: b, def };
  }

  cancelBuild(uid) {
    const i = this.buildings.findIndex(b => b.uid === uid);
    if (i < 0) return false;
    const b = this.buildings[i];
    const def = BUILDINGS[b.type];
    // Se devuelve la mitad de los materiales
    for (const res of Object.keys(def.cost)) this.storage[res] += def.cost[res] * 0.5;
    this.buildings.splice(i, 1);
    this.pushEvent(`↩️ Construcción de ${def.name} cancelada`, 'info');
    return true;
  }

  // -------------------------------------------------------------------- Eras

  canAdvanceEra() {
    const next = ERAS[this.era + 1];
    if (!next) return { ok: false, reason: 'Ya estás en la última era' };
    if ((this.storage.knowledge || 0) < next.knowledge) {
      return { ok: false, reason: `Falta conocimiento (${Math.floor(this.storage.knowledge || 0)}/${next.knowledge})` };
    }
    for (const res of Object.keys(next.cost)) {
      if ((this.storage[res] || 0) < next.cost[res]) {
        return { ok: false, reason: `Faltan recursos para ${next.name}` };
      }
    }
    return { ok: true, next };
  }

  advanceEra() {
    const check = this.canAdvanceEra();
    if (!check.ok) return check;
    const next = check.next;
    for (const res of Object.keys(next.cost)) this.storage[res] -= next.cost[res];
    this.era = next.id;
    this.pushEvent(`${next.icon} ¡Nueva era: ${next.name}! ${next.desc}`, 'era');
    return { ok: true, era: this.era };
  }

  // ----------------------------------------------------------------- Unidades

  spawnUnit(role) {
    const def = UNIT_TYPES[role] || UNIT_TYPES.citizen;
    const c = this.findBuilding('center');
    const u = {
      uid: this._nextUid(), role,
      x: (c ? c.x : 0) + _r(-3, 3), z: (c ? c.z : 0) + _r(-3, 3),
      tx: null, tz: null, state: 'idle', wait: 0,
      building: null, node: null, carry: 0,
    };
    this.units.push(u);
    return u;
  }

  removeUnit(uid) {
    const i = this.units.findIndex(u => u.uid === uid);
    if (i < 0) return;
    this.units.splice(i, 1);
  }

  citizensByRole(role) { return this.units.filter(u => u.role === role).length; }

  /**
   * Reparte a los ciudadanos entre los papeles disponibles según los
   * deslizadores de prioridad (estilo Rise of Nations).
   */
  assignWork() {
    const prio = this.priority;
    // 1) Cuotas deseadas por edificio
    const pending = this.buildings.filter(b => b.progress < 1);
    const want = { builder: 0, farmer: 0, logger: 0, miner: 0, scholar: 0 };
    if (pending.length) {
      const p = Math.max(1, prio.build);
      want.builder = Math.min(4, Math.max(1, Math.round(pending.length * p / 10)));
    }
    for (const b of this.buildings) {
      if (b.progress < 1) continue;
      const def = BUILDINGS[b.type];
      if (!def || !def.workers) { b.workers = 0; continue; }
      const role = def.role;
      const p = prio[ROLE_PRIORITY[role]] ?? 5;
      b.workers = p <= 0 ? 0 : Math.max(1, Math.round(def.workers * p / 10));
      if (role && want[role] !== undefined) want[role] += b.workers;
    }
    // 2) Guardias: se "convierten" ciudadanos ociosos
    let guardCap = 0;
    for (const b of this.buildings) {
      if (b.progress >= 1 && BUILDINGS[b.type] && BUILDINGS[b.type].guards) guardCap += BUILDINGS[b.type].guards;
    }
    const wantGuards = Math.round(guardCap * Math.max(0, prio.defense) / 10);
    const guards = this.units.filter(u => u.role === 'guard');
    if (guards.length > wantGuards) {
      for (let i = guards.length - 1; i >= wantGuards; i--) guards[i].role = 'citizen';
    }

    // 3) Asignar ciudadanos libres por orden de prioridad
    const order = Object.keys(want).sort((a, b) => {
      const pa = prio[ROLE_PRIORITY[a]] ?? 5;
      const pb = prio[ROLE_PRIORITY[b]] ?? 5;
      return pb - pa;
    });
    const pool = this.units.filter(u => u.role !== 'guard');
    for (const u of pool) { u.building = null; u.node = null; }
    const free = pool.slice();
    for (const role of order) {
      while (want[role] > 0 && free.length) {
        const u = free.shift();
        u.role = role;
        want[role]--;
      }
    }
    for (const u of free) u.role = 'citizen';

    // 4) Cada trabajador se engancha a un edificio concreto de su papel
    for (const b of this.buildings) {
      if (b.progress < 1) continue;
      const def = BUILDINGS[b.type];
      if (!def || !def.role || !b.workers) continue;
      let n = 0;
      for (const u of this.units) {
        if (n >= b.workers) break;
        if (u.role === def.role && !u.building) { u.building = b.uid; u.node = b.node; n++; }
      }
    }
    // Constructores -> obra pendiente
    for (const b of pending) {
      for (const u of this.units) {
        if (u.role === 'builder' && !u.building) { u.building = b.uid; u.node = null; break; }
      }
    }
    // La producción depende de los peones realmente destinados (no de la cuota)
    for (const b of this.buildings) {
      if (b.progress < 1) continue;
      const def = BUILDINGS[b.type];
      if (!def || !def.workers) continue;
      let assigned = 0;
      for (const u of this.units) if (u.building === b.uid) assigned++;
      b.workers = assigned;
    }
    // 5) Guardias nuevos (cuestan comida y metal, ocupan población)
    const nowGuards = this.units.filter(u => u.role === 'guard').length;
    if (nowGuards < wantGuards) {
      const idle = this.units.find(u => u.role === 'citizen');
      const cost = (BUILDINGS.barracks.guardCost) || {};
      const affordable = Object.keys(cost).every(r => (this.storage[r] || 0) >= cost[r]);
      if (idle && affordable) {
        Object.keys(cost).forEach(r => { this.storage[r] -= cost[r]; });
        idle.role = 'guard';
        this.pushEvent('🛡️ Un colono se alista como guardia', 'info');
      }
    }
  }

  // -------------------------------------------------------------------- Bucle

  update(dt, options = {}) {
    const active = options.active !== false;
    if (!(dt > 0)) return;
    this.age += dt;

    this._consumeFood(dt);
    this._produce(dt);
    this._construction(dt);
    this._barracks(dt);
    this._growth(dt);
    this._raids(dt);

    this._assignTimer -= dt;
    if (this._assignTimer <= 0) {
      this._assignTimer = 0.6;
      this.assignWork();
    }
    if (active) this._moveUnits(dt);
  }

  _consumeFood(dt) {
    const need = this.foodRate * dt;
    if (this.storage.food >= need) {
      this.storage.food -= need;
      this.hunger = Math.max(0, this.hunger - dt * 0.5);
    } else {
      this.storage.food = 0;
      this.hunger += dt;
      if (this.hunger > 12) {
        this.hunger = 0;
        const victim = this.units.find(u => u.role !== 'guard') || this.units[0];
        if (victim && this.population > 1) {
          this.removeUnit(victim.uid);
          this.stats.lost++;
          this.pushEvent('💀 Un ciudadano ha muerto de hambre: construye granjas', 'danger');
        }
      }
    }
  }

  _produce(dt) {
    for (const b of this.buildings) {
      if (b.progress < 1) continue;
      const def = BUILDINGS[b.type];
      if (!def || !def.produces || !b.workers) continue;
      const factor = this._nodeFactor(b, def);
      for (const res of Object.keys(def.produces)) {
        const amount = def.produces[res] * b.workers * this.eraBonus
          * yieldFactor(this.planetId, res) * factor * dt;
        if (amount <= 0) continue;
        this.storage[res] = (this.storage[res] || 0) + amount;
        this.stats.gathered[res] = (this.stats.gathered[res] || 0) + amount;
        // El recurso sale del yacimiento (si lo hay)
        const node = this.nodes.find(n => n.uid === b.node);
        if (node && node.amount > 0) node.amount = Math.max(0, node.amount - amount);
      }
      // Taller: convierte metal en cristal
      if (def.converts) {
        const inRes = Object.keys(def.converts.input)[0];
        const outRes = Object.keys(def.converts.output)[0];
        const need = def.converts.input[inRes] * b.workers * dt;
        if ((this.storage[inRes] || 0) >= need) {
          this.storage[inRes] -= need;
          this.storage[outRes] = (this.storage[outRes] || 0) + def.converts.output[outRes] * b.workers * dt * this.eraBonus;
        }
      }
    }
    // Los yacimientos agotados se regeneran muy despacio (nunca se acaba el mapa)
    for (const n of this.nodes) {
      if (n.amount < n.maxAmount) n.amount = Math.min(n.maxAmount, n.amount + BALANCE.nodeRegen * dt);
    }
  }

  _construction(dt) {
    for (const b of this.buildings) {
      if (b.progress >= 1) continue;
      const def = BUILDINGS[b.type];
      const builders = this.units.filter(u => u.role === 'builder' && u.building === b.uid).length;
      if (!builders) {
        if (!this._warned.nobuilder) {
          this._warned.nobuilder = true;
          this.pushEvent('👷 No hay constructores: sube la prioridad de Construcción', 'warn');
        }
        continue;
      }
      this._warned.nobuilder = false;
      b.progress += (dt / Math.max(1, def.buildTime)) * builders;
      if (b.progress >= 1) {
        b.progress = 1;
        b.hp = 100;
        this._linkNode(b, def);
        this.pushEvent(`✅ ${def.icon} ${def.name} terminado`, 'success');
      }
    }
  }

  _barracks(dt) {
    // El cuartel solo prepara guardias: el reclutamiento real ocurre en assignWork
    for (const b of this.buildings) {
      if (b.type === 'barracks' && b.progress >= 1) b.guardTimer = (b.guardTimer || 0) + dt;
    }
  }

  _growth(dt) {
    if (this.population >= this.popCap) return;
    this.growthTimer += dt;
    if (this.growthTimer < BALANCE.growthTime) return;
    this.growthTimer = 0;
    if (this.storage.food < BALANCE.growthFood) return;
    this.storage.food -= BALANCE.growthFood;
    this.spawnUnit('citizen');
    this.pushEvent(`👶 Nuevo ${this.theme.singular} en la colonia (${this.population}/${this.popCap})`, 'success');
  }

  _raids(dt) {
    const raid = this.raid;
    if (!raid.active) {
      raid.timer -= dt;
      if (raid.timer > 0) return;
      raid.active = true;
      raid.time = BALANCE.raidDuration;
      raid.power = Math.round(18 + this.age / 45 + this.era * 14 + _r(0, 16));
      raid.name = this.era >= 2 ? 'Incursión de drones' : 'Lluvia de meteoros';
      this.stats.raids++;
      this.pushEvent(`☄️ ¡${raid.name}! Poder ${raid.power} contra tu defensa ${this.defense}`, 'danger');
      return;
    }
    raid.time -= dt;
    const def = this.defense;
    if (def >= raid.power) {
      if (raid.time <= 0) this._endRaid(true);
      return;
    }
    const dps = (raid.power - def) * 0.55;
    const targets = this.buildings.filter(b => b.type !== 'center' && b.progress >= 1);
    const victim = targets.length ? targets[Math.floor(Math.random() * targets.length)] : this.findBuilding('center');
    if (victim) {
      victim.hp = Math.max(0, victim.hp - dps * dt);
      if (victim.hp <= 0) this._destroyBuilding(victim, `${BUILDINGS[victim.type].icon} ${BUILDINGS[victim.type].name} destruido`);
    }
    // Bajas entre los guardias
    if (Math.random() < dt * 0.06 * (raid.power - def) / 20) {
      const guard = this.units.find(u => u.role === 'guard');
      if (guard) {
        this.removeUnit(guard.uid);
        this.stats.lost++;
        this.pushEvent('⚔️ Un guardia ha caído defendiendo la colonia', 'danger');
      }
    }
    if (raid.time <= 0) this._endRaid(false);
  }

  _endRaid(repelled) {
    this.raid.active = false;
    this.raid.timer = _r(BALANCE.raidMin, BALANCE.raidMax);
    if (repelled) {
      this.stats.raidsRepelled++;
      this.storage.knowledge += 8;
      this.pushEvent('🛡️ ¡Incursión repelida! +8 conocimiento', 'success');
    } else {
      this.pushEvent('🔥 La incursión ha terminado: repara y refuerza la defensa', 'warn');
    }
  }

  _destroyBuilding(b, message) {
    const i = this.buildings.indexOf(b);
    if (i >= 0) this.buildings.splice(i, 1);
    this.stats.buildingsLost++;
    for (const u of this.units) {
      if (u.building === b.uid) { u.building = null; u.node = null; }
    }
    if (b.type === 'center') {
      // Sin centro no hay colonia: se reconstruye solo (gratis) en el sitio original
      const c = this._makeBuilding('center', (GRID - 1) / 2, (GRID - 1) / 2);
      c.progress = 1;
      this.buildings.push(c);
      this.pushEvent('🏛️ El centro de la colonia ha caído: se reconstruye de emergencia', 'danger');
      return;
    }
    this.pushEvent(`💥 ${message}`, 'danger');
  }

  // ------------------------------------------------------- Movimiento (visual)

  _moveUnits(dt) {
    const center = this.findBuilding('center');
    for (const u of this.units) {
      const speed = (UNIT_TYPES[u.role] || UNIT_TYPES.citizen).speed;
      if (u.wait > 0) { u.wait -= dt; }
      if (u.tx === null || u.tz === null || u.wait > 0) {
        // Elegir destino
        let tx = null;
        let tz = null;
        const b = u.building !== null ? this.buildings.find(x => x.uid === u.building) : null;
        if (u.role === 'guard') {
          const a = this.age * 0.35 + u.uid;
          tx = Math.cos(a) * (CITY_RADIUS - 6);
          tz = Math.sin(a) * (CITY_RADIUS - 6);
        } else if (b && u.node !== null) {
          const node = this.nodes.find(n => n.uid === u.node);
          // Va y viene entre la faena y el edificio
          const goNode = ((this.age * 0.12 + u.uid * 0.37) % 2) < 1;
          if (node && goNode) { tx = node.x; tz = node.z; } else { tx = b.x; tz = b.z; }
        } else if (b) {
          tx = b.x + _r(-2, 2);
          tz = b.z + _r(-2, 2);
        } else if (center) {
          tx = center.x + _r(-9, 9);
          tz = center.z + _r(-9, 9);
        } else {
          tx = _r(-10, 10);
          tz = _r(-10, 10);
        }
        u.tx = tx;
        u.tz = tz;
      }
      const dx = u.tx - u.x;
      const dz = u.tz - u.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.7) {
        u.wait = _r(0.4, 1.6);
        if (u.node !== null) u.carry = (u.carry + 1) % (BALANCE.carryMax + 1);
      } else {
        const step = Math.min(d, speed * dt);
        u.x += (dx / d) * step;
        u.z += (dz / d) * step;
        u.facing = Math.atan2(dx, dz);
      }
    }
  }

  // ---------------------------------------------------------------- Exportar

  /** Envía parte del almacén a la órbita (necesita puerto espacial). */
  exportToOrbit() {
    if (!this.hasSpaceport()) return { ok: false, reason: 'Necesitas un puerto espacial 🚀' };
    const sent = {};
    let value = 0;
    for (const res of Object.keys(this.storage)) {
      if (res === 'knowledge' || res === 'food') continue;
      const amount = Math.floor(this.storage[res] * BALANCE.exportRate);
      if (amount > 0) {
        sent[res] = amount;
        this.storage[res] -= amount;
        value += amount;
      }
    }
    if (!value) return { ok: false, reason: 'No hay materiales que enviar' };
    this.stats.exported += value;
    this.pushEvent(`🚀 ${value} unidades enviadas a la órbita`, 'success');
    return { ok: true, materials: sent, value };
  }

  // ------------------------------------------------------------------ Eventos

  pushEvent(message, type = 'info') {
    this.events.push({ message, type, at: this.age });
    if (this.events.length > 30) this.events.shift();
  }

  drainEvents() {
    if (!this.events.length) return [];
    const out = this.events;
    this.events = [];
    return out;
  }

  // ------------------------------------------------------------ Persistencia

  toJSON() {
    return {
      v: 1,
      planetId: this.planetId,
      name: this.name,
      age: Math.round(this.age * 10) / 10,
      era: this.era,
      uidSeq: this.uidSeq,
      storage: this._roundStorage(),
      priority: { ...this.priority },
      hunger: this.hunger,
      growthTimer: this.growthTimer,
      raid: { ...this.raid },
      stats: { ...this.stats, gathered: { ...this.stats.gathered } },
      buildings: this.buildings.map(b => ({ ...b })),
      nodes: this.nodes.map(n => ({ ...n, amount: Math.round(n.amount) })),
      units: this.units.map(u => ({
        uid: u.uid, role: u.role, x: Math.round(u.x * 100) / 100, z: Math.round(u.z * 100) / 100,
        building: u.building, node: u.node, carry: u.carry,
      })),
    };
  }

  _roundStorage() {
    const out = {};
    for (const k of Object.keys(this.storage)) out[k] = Math.round(this.storage[k] * 10) / 10;
    return out;
  }

  static fromJSON(data) {
    if (!data || !data.planetId) return null;
    const c = new Colony(data.planetId);
    c.name = data.name || c.name;
    c.age = Number(data.age) || 0;
    c.era = Math.max(0, Math.min(ERAS.length - 1, data.era | 0));
    c.uidSeq = Math.max(1, data.uidSeq | 0);
    c.storage = { ...BALANCE.startStorage };
    if (data.storage) {
      for (const k of Object.keys(c.storage)) {
        if (typeof data.storage[k] === 'number' && isFinite(data.storage[k])) c.storage[k] = data.storage[k];
      }
    }
    if (data.priority) {
      for (const k of Object.keys(c.priority)) {
        const v = Number(data.priority[k]);
        if (isFinite(v)) c.priority[k] = Math.max(0, Math.min(10, v));
      }
    }
    c.hunger = Number(data.hunger) || 0;
    c.growthTimer = Number(data.growthTimer) || 0;
    if (data.raid && typeof data.raid === 'object') {
      c.raid = {
        timer: Number(data.raid.timer) || BALANCE.raidFirst,
        active: !!data.raid.active,
        time: Number(data.raid.time) || 0,
        power: Number(data.raid.power) || 0,
        name: data.raid.name || '',
      };
    }
    if (data.stats && typeof data.stats === 'object') {
      c.stats = {
        gathered: { ...(data.stats.gathered || {}) },
        built: data.stats.built | 0,
        raids: data.stats.raids | 0,
        raidsRepelled: data.stats.raidsRepelled | 0,
        lost: data.stats.lost | 0,
        exported: data.stats.exported | 0,
        buildingsLost: data.stats.buildingsLost | 0,
      };
    }
    if (Array.isArray(data.buildings) && data.buildings.length) {
      c.buildings = data.buildings
        .filter(b => b && BUILDINGS[b.type])
        .map(b => ({
          uid: b.uid | 0, type: b.type,
          tx: b.tx | 0, tz: b.tz | 0,
          x: Number(b.x) || 0, z: Number(b.z) || 0,
          progress: Math.max(0, Math.min(1, Number(b.progress) || 0)),
          hp: Math.max(0, Math.min(100, Number(b.hp) || 100)),
          workers: b.workers | 0,
          node: typeof b.node === 'number' ? b.node : null,
          guardTimer: Number(b.guardTimer) || 0,
        }));
      if (!c.buildings.some(b => b.type === 'center')) c._createCenter();
    }
    if (Array.isArray(data.nodes) && data.nodes.length) {
      c.nodes = data.nodes
        .filter(n => n && typeof n.x === 'number')
        .map(n => ({
          uid: n.uid | 0, kind: n.kind || 'vein', resource: n.resource || 'metal',
          x: n.x, z: n.z, amount: Math.max(0, Number(n.amount) || 0),
          maxAmount: Math.max(1, Number(n.maxAmount) || 900),
        }));
    }
    if (Array.isArray(data.units)) {
      c.units = data.units
        .filter(u => u && UNIT_TYPES[u.role])
        .map(u => ({
          uid: u.uid | 0, role: u.role, x: Number(u.x) || 0, z: Number(u.z) || 0,
          tx: null, tz: null, state: 'idle', wait: 0,
          building: typeof u.building === 'number' ? u.building : null,
          node: typeof u.node === 'number' ? u.node : null,
          carry: u.carry | 0,
        }));
    }
    const maxUid = Math.max(
      c.uidSeq,
      ...c.buildings.map(b => b.uid + 1),
      ...c.nodes.map(n => n.uid + 1),
      ...c.units.map(u => u.uid + 1),
    );
    c.uidSeq = Math.max(1, maxUid);
    c.assignWork();
    return c;
  }
}
