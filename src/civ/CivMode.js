import * as THREE from 'three';
import { Colony, tileToLocal, localToTile, inGrid } from './Colony.js';
import {
  BUILDINGS, ERAS, GRID, TILE, CITY_RADIUS, TERRAIN_RADIUS, UNIT_TYPES, planetCiv,
} from './CivConfig.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _ndc = new THREE.Vector2();
const _up = new THREE.Vector3(0, 1, 0);

/** Altura del terreno: llano dentro de la ciudad, colinas fuera. */
export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  const blend = THREE.MathUtils.smoothstep(r, CITY_RADIUS * 0.45, CITY_RADIUS * 1.05);
  const n = Math.sin(x * 0.16) * Math.cos(z * 0.13)
    + Math.sin((x + z) * 0.07) * 0.8
    + Math.cos((x - z) * 0.11) * 0.6;
  return n * 2.4 * blend;
}

function disposeObject(root) {
  root.traverse((o) => {
    if (o.geometry) { try { o.geometry.dispose(); } catch (e) { /* noop */ } }
    const m = o.material;
    if (m) {
      const list = Array.isArray(m) ? m : [m];
      for (const mm of list) { try { mm.dispose(); } catch (e) { /* noop */ } }
    }
  });
}

/**
 * CivMode - El "modo civilizar": superficie del planeta, cámara estratégica y
 * colonias. Mantiene la simulación (Colony) de TODOS los planetas y sólo dibuja
 * la que se está visitando.
 */
export class CivMode {
  constructor(scene, renderer, options = {}) {
    this.scene = scene;
    this.renderer = renderer;
    this.options = options;
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / Math.max(1, window.innerHeight), 0.1, 2500);
    this.colonies = new Map();
    this.active = false;
    this.planet = null;
    this.colony = null;
    this.root = null;
    this.terrain = null;
    this.lights = null;
    this.grid = null;
    this.marker = null;
    this.ghost = null;
    this.bMeshes = new Map();
    this.uMeshes = new Map();
    this.nMeshes = new Map();
    this.pendingType = null;
    this.selectedTile = null;
    this.view = { yaw: 0.8, pitch: 0.92, dist: 58, fx: 0, fz: 0 };
    this.time = 0;
    this.onEvent = null;
    this.onChanged = null;
    this._pointer = { active: false, id: null, x: 0, y: 0, moved: 0, t0: 0 };
    this._pinch = { active: false, dist: 0 };
    this._pointers = new Map();
    this._ray = new THREE.Raycaster();
    this._bound = {
      down: (e) => this._onPointerDown(e),
      move: (e) => this._onPointerMove(e),
      up: (e) => this._onPointerUp(e),
      wheel: (e) => this._onWheel(e),
      resize: () => this._onResize(),
    };
  }

  // --------------------------------------------------------------- Colonias

  getColony(planetId, create = true) {
    let c = this.colonies.get(planetId);
    if (!c && create) {
      c = new Colony(planetId);
      this.colonies.set(planetId, c);
    }
    return c || null;
  }

  hasColony(planetId) { return this.colonies.has(planetId); }

  coloniesSummary() {
    const out = [];
    for (const [planetId, c] of this.colonies) {
      out.push({ planetId, name: c.name, era: c.era, population: c.population, buildings: c.buildings.length });
    }
    return out;
  }

  /** Avanza la economía de todas las colonias (y mueve los peones de la activa). */
  updateColonies(delta) {
    for (const [planetId, c] of this.colonies) {
      const isActive = this.active && this.planet && this.planet.config.id === planetId;
      try {
        c.update(delta, { active: isActive });
      } catch (e) {
        console.error('[Civ] Error actualizando colonia', planetId, e);
      }
    }
  }

  drainEvents() {
    const out = [];
    for (const c of this.colonies.values()) {
      for (const ev of c.drainEvents()) out.push({ ...ev, planetId: c.planetId, name: c.name });
    }
    return out;
  }

  loadColonies(data) {
    this.colonies.clear();
    if (!data || typeof data !== 'object') return 0;
    let n = 0;
    for (const key of Object.keys(data)) {
      try {
        const c = Colony.fromJSON(data[key]);
        if (c) { this.colonies.set(key, c); n++; }
      } catch (e) {
        console.warn('[Civ] Colonia no cargable:', key, e);
      }
    }
    return n;
  }

  serializeColonies() {
    const out = {};
    for (const [planetId, c] of this.colonies) out[planetId] = c.toJSON();
    return out;
  }

  reset() {
    this.exit();
    for (const c of this.colonies.values()) { try { c.events.length = 0; } catch (e) { /* noop */ } }
    this.colonies.clear();
  }

  // ----------------------------------------------------------------- Entrar

  enter(planet) {
    if (this.active || !planet) return false;
    try {
      this.planet = planet;
      this.colony = this.getColony(planet.config.id);
      this.root = new THREE.Group();
      this.root.name = `civ-${planet.config.id}`;

      // Punto de aterrizaje: el lado del planeta que mira a WALL·E (se pasa por options)
      const n = (this.options && this.options.landingNormal) ? this.options.landingNormal.clone().normalize() : new THREE.Vector3(1, 0, 0);
      this.root.quaternion.setFromUnitVectors(_up, n);
      this.root.position.copy(n).multiplyScalar(planet.config.radius - 0.05);
      planet.group.add(this.root);

      this._buildTerrain(planet);
      this._buildLights(planet);
      this._buildGrid();
      this._buildMarker();
      this._sync(true);

      this.view = { yaw: 0.8, pitch: 0.95, dist: 56, fx: 0, fz: 0 };
      this.camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
      this.camera.updateProjectionMatrix();
      this._updateCamera(1);

      const el = this.renderer && this.renderer.domElement;
      if (el) {
        el.addEventListener('pointerdown', this._bound.down);
        window.addEventListener('pointermove', this._bound.move);
        window.addEventListener('pointerup', this._bound.up);
        window.addEventListener('pointercancel', this._bound.up);
        el.addEventListener('wheel', this._bound.wheel, { passive: false });
      }
      window.addEventListener('resize', this._bound.resize);

      this.active = true;
      this.pendingType = null;
      this.selectedTile = null;
      if (this.onChanged) this.onChanged('enter', this.colony);
      return true;
    } catch (e) {
      console.error('[Civ] Error entrando al planeta:', e);
      this._cleanup();
      return false;
    }
  }

  exit() {
    if (!this.active) return false;
    this.active = false;
    const el = this.renderer && this.renderer.domElement;
    if (el) {
      el.removeEventListener('pointerdown', this._bound.down);
      el.removeEventListener('wheel', this._bound.wheel);
    }
    window.removeEventListener('pointermove', this._bound.move);
    window.removeEventListener('pointerup', this._bound.up);
    window.removeEventListener('pointercancel', this._bound.up);
    window.removeEventListener('resize', this._bound.resize);
    this._cleanup();
    if (this.onChanged) this.onChanged('exit', null);
    return true;
  }

  _cleanup() {
    this.bMeshes.clear();
    this.uMeshes.clear();
    this.nMeshes.clear();
    if (this.root) {
      try {
        this.root.removeFromParent();
        disposeObject(this.root);
      } catch (e) { /* noop */ }
      this.root = null;
    }
    this.terrain = null;
    this.grid = null;
    this.marker = null;
    this.ghost = null;
    this.colony = null;
    this.planet = null;
    this._pointers.clear();
  }

  // ------------------------------------------------------------- Construcción

  _buildTerrain(planet) {
    const theme = planetCiv(planet.config.id);
    const geo = new THREE.CircleGeometry(TERRAIN_RADIUS, 72);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const ground = new THREE.Color(theme.ground);
    const rock = new THREE.Color(theme.rock);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = heightAt(x, z);
      pos.setY(i, y);
      const k = THREE.MathUtils.clamp((y + 2.4) / 4.8, 0, 1);
      tmp.copy(ground).lerp(rock, k * 0.85);
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.02 });
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.name = 'civ-terrain';
    this.root.add(this.terrain);

    // Borde del asentamiento
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(CITY_RADIUS - 0.4, CITY_RADIUS, 96),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    this.root.add(ring);
  }

  _buildLights(planet) {
    const theme = planetCiv(planet.config.id);
    this.lights = new THREE.Group();
    const hemi = new THREE.HemisphereLight(theme.sky, theme.ground, 0.75);
    const dir = new THREE.DirectionalLight(0xfff3dd, 1.35);
    dir.position.set(40, 80, 30);
    const fill = new THREE.DirectionalLight(theme.sky, 0.4);
    fill.position.set(-30, 25, -40);
    this.lights.add(hemi, dir, fill);
    this.root.add(this.lights);
  }

  _buildGrid() {
    this.grid = new THREE.GridHelper(GRID * TILE, GRID, 0x00f0ff, 0x00a0c0);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.22;
    this.grid.material.depthWrite = false;
    this.grid.position.y = 0.12;
    this.grid.visible = false;
    this.root.add(this.grid);
  }

  _buildMarker() {
    const mat = new THREE.MeshBasicMaterial({ color: 0x39ff7a, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false });
    this.marker = new THREE.Mesh(new THREE.RingGeometry(TILE * 0.36, TILE * 0.48, 4), mat);
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.rotation.z = Math.PI / 4;
    this.marker.visible = false;
    this.root.add(this.marker);

    this.ghost = new THREE.Mesh(
      new THREE.BoxGeometry(TILE * 0.7, 2.4, TILE * 0.7),
      new THREE.MeshBasicMaterial({ color: 0x39ff7a, transparent: true, opacity: 0.22, depthWrite: false })
    );
    this.ghost.visible = false;
    this.root.add(this.ghost);
  }

  // -------------------------------------------------------- Mallas de objetos

  _mat(color, opts = {}) {
    const m = new THREE.MeshStandardMaterial({
      color, roughness: opts.roughness ?? 0.7, metalness: opts.metalness ?? 0.15,
      emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 1,
      transparent: !!opts.transparent, opacity: opts.opacity ?? 1, flatShading: !!opts.flat,
    });
    // Valores originales: al terminar una obra hay que devolverlos (la obra en
    // curso se dibuja semitransparente y encogida).
    m.userData.baseOpacity = m.opacity;
    m.userData.baseEmissive = m.emissive.getHex();
    return m;
  }

  _makeBuildingMesh(building) {
    const def = BUILDINGS[building.type];
    const theme = planetCiv(this.planet.config.id);
    const g = new THREE.Group();
    const accent = new THREE.Color(theme.sky).lerp(new THREE.Color(0xffffff), 0.55).getHex();
    const wall = this._mat(new THREE.Color(theme.rock).lerp(new THREE.Color(0xffffff), 0.35).getHex());
    const glow = this._mat(accent, { emissive: accent, emissiveIntensity: 0.9, roughness: 0.4 });
    const dark = this._mat(0x2b2f36, { metalness: 0.6, roughness: 0.4 });

    const box = (w, h, d, m, y = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.y = y + h / 2;
      g.add(mesh);
      return mesh;
    };
    const cyl = (rt, rb, h, m, y = 0, seg = 12) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
      mesh.position.y = y + h / 2;
      g.add(mesh);
      return mesh;
    };

    switch (building.type) {
      case 'center': {
        cyl(3.2, 3.6, 1.2, wall, 0, 16);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(2.6, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), glow);
        dome.position.y = 1.2;
        g.add(dome);
        cyl(0.22, 0.22, 3.4, dark, 1.2);
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), glow);
        beacon.position.y = 4.8;
        g.add(beacon);
        break;
      }
      case 'house': {
        box(3.2, 2, 3.2, wall, 0);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.6, 4), this._mat(new THREE.Color(theme.ground).getHex()));
        roof.position.y = 2.8;
        roof.rotation.y = Math.PI / 4;
        g.add(roof);
        break;
      }
      case 'farm': {
        const field = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.25, 5.4), this._mat(0x69a64a, { roughness: 1 }));
        field.position.y = 0.12;
        g.add(field);
        for (let i = -2; i <= 2; i++) {
          const row = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.55, 5), this._mat(0x9bd46a, { roughness: 1 }));
          row.position.set(i * 1.05, 0.5, 0);
          g.add(row);
        }
        box(1.4, 1.4, 1.4, wall, 0).position.x = 3.4;
        break;
      }
      case 'sawmill': {
        box(3.6, 2.2, 2.6, wall, 0);
        const blade = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.14, 16), this._mat(0xd8dde4, { metalness: 0.8, roughness: 0.3 }));
        blade.rotation.z = Math.PI / 2;
        blade.position.set(2.1, 1.6, 0);
        blade.name = 'spin';
        g.add(blade);
        for (let i = 0; i < 3; i++) {
          const log = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2.4, 8), this._mat(0x8a5a2b, { roughness: 1 }));
          log.rotation.z = Math.PI / 2;
          log.position.set(-2.6, 0.4 + i * 0.3, -1 + i * 0.7);
          g.add(log);
        }
        break;
      }
      case 'mine': {
        const hill = new THREE.Mesh(new THREE.ConeGeometry(2.6, 2.2, 7), this._mat(0x6b6258, { flat: true, roughness: 1 }));
        hill.position.set(-1.4, 1.1, 0);
        g.add(hill);
        box(2.2, 1.6, 2.2, dark, 0).position.x = 1.8;
        const rail = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.16, 0.9), this._mat(0x8a8f98, { metalness: 0.7 }));
        rail.position.set(0, 0.5, 1.8);
        rail.rotation.z = -0.12;
        g.add(rail);
        const cart = new THREE.Mesh(new THREE.BoxGeometry(1, 0.7, 0.9), glow);
        cart.position.set(0, 1.05, 1.8);
        cart.name = 'cart';
        g.add(cart);
        break;
      }
      case 'plant': {
        cyl(1.9, 2.2, 2.4, dark, 0, 14);
        const core = new THREE.Mesh(new THREE.SphereGeometry(1.1, 14, 12), glow);
        core.position.y = 3.1;
        core.name = 'pulse';
        g.add(core);
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          const pole = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.6, 0.2), dark);
          pole.position.set(Math.cos(a) * 2.4, 1.8, Math.sin(a) * 2.4);
          g.add(pole);
        }
        break;
      }
      case 'barracks': {
        box(4, 2, 3, wall, 0);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.4, 6), dark);
        pole.position.set(1.6, 3.6, 1.2);
        g.add(pole);
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), this._mat(0xff5a5a, { emissive: 0x661111 }));
        flag.position.set(2.4, 4.4, 1.2);
        g.add(flag);
        break;
      }
      case 'turret': {
        cyl(1.2, 1.5, 0.9, dark, 0, 10);
        const head = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1, 1.5), wall);
        head.position.y = 1.4;
        head.name = 'turretHead';
        g.add(head);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 2.4, 8), this._mat(0xb9c0c9, { metalness: 0.8 }));
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 1.5, 1.5);
        head.add(barrel);
        barrel.position.set(0, 0.1, 1.4);
        break;
      }
      case 'workshop': {
        box(4.4, 2.4, 3.2, wall, 0);
        const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 3.2, 10), dark);
        chimney.position.set(1.5, 3.9, -0.8);
        g.add(chimney);
        const gear = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.22, 8, 16), this._mat(0xd8b25a, { metalness: 0.7 }));
        gear.position.set(-2.4, 1.6, 1.5);
        gear.name = 'spin';
        g.add(gear);
        break;
      }
      case 'lab': {
        box(3.8, 1.8, 3.8, wall, 0);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(1.9, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
          this._mat(0x9fd8ff, { transparent: true, opacity: 0.55, emissive: 0x224466 }));
        dome.position.y = 1.8;
        g.add(dome);
        const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3, 6), dark);
        ant.position.set(1.4, 3.6, 1.4);
        g.add(ant);
        break;
      }
      case 'spaceport': {
        cyl(4.2, 4.4, 0.4, this._mat(0x4a5158, { metalness: 0.5 }), 0, 24);
        const rocket = new THREE.Mesh(new THREE.ConeGeometry(1, 4.4, 12), this._mat(0xe6ebf2, { metalness: 0.4, roughness: 0.35 }));
        rocket.position.y = 2.6;
        g.add(rocket);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.6, 12), this._mat(0xd0d6dd, { metalness: 0.4 }));
        body.position.y = 1.2;
        g.add(body);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.6, 10), glow);
        flame.rotation.x = Math.PI;
        flame.position.y = 0.4;
        flame.name = 'pulse';
        g.add(flame);
        const tower = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5, 0.5), dark);
        tower.position.set(2.6, 2.5, 0);
        g.add(tower);
        break;
      }
      default:
        box(2, 2, 2, wall, 0);
    }

    g.position.set(building.x, heightAt(building.x, building.z), building.z);
    const entry = { group: g, progress: -1, hp: -1, spin: null, pulse: null, cart: null, turretHead: null };
    g.traverse((o) => {
      if (o.name === 'spin') entry.spin = o;
      if (o.name === 'pulse') entry.pulse = o;
      if (o.name === 'cart') entry.cart = o;
      if (o.name === 'turretHead') entry.turretHead = o;
    });
    return entry;
  }

  _makeUnitMesh(unit) {
    const def = UNIT_TYPES[unit.role] || UNIT_TYPES.citizen;
    const g = new THREE.Group();
    const bodyMat = this._mat(def.color, { roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.62, 4, 8), bodyMat);
    body.position.y = 0.72;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), this._mat(0xf2d3b0, { roughness: 0.8 }));
    head.position.y = 1.36;
    g.add(head);
    if (unit.role === 'guard') {
      const shield = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.6), this._mat(0xffd166, { metalness: 0.5 }));
      shield.position.set(0.36, 0.85, 0);
      g.add(shield);
    }
    if (unit.role === 'builder') {
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.24, 8), this._mat(0xffc14d));
      hat.position.y = 1.62;
      g.add(hat);
    }
    g.position.set(unit.x, heightAt(unit.x, unit.z), unit.z);
    return { group: g, role: unit.role, body };
  }

  _makeNodeMesh(node) {
    const g = new THREE.Group();
    if (node.kind === 'forest') {
      const n = 4;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + node.uid;
        const r = 1.1 + (i % 2) * 0.7;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.2, 6), this._mat(0x7a4f28, { roughness: 1 }));
        trunk.position.set(Math.cos(a) * r, 0.6, Math.sin(a) * r);
        g.add(trunk);
        const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.95, 2.1, 7), this._mat(0x3f9c4a, { roughness: 1 }));
        leaves.position.set(Math.cos(a) * r, 2.1, Math.sin(a) * r);
        g.add(leaves);
      }
    } else if (node.kind === 'crystal') {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + node.uid;
        const r = 0.9 + (i % 2) * 0.8;
        const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.8 + (i % 2) * 0.35, 0),
          this._mat(0xff5ae0, { emissive: 0x550044, emissiveIntensity: 1.2, flat: true }));
        c.position.set(Math.cos(a) * r, 0.8, Math.sin(a) * r);
        c.rotation.y = a;
        g.add(c);
      }
    } else {
      const color = node.resource === 'metal' ? 0x8d949c : node.resource === 'stone' ? 0x7d7365 : 0x8d949c;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + node.uid * 0.7;
        const r = 0.8 + (i % 2) * 0.9;
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75 + (i % 3) * 0.25, 0), this._mat(color, { flat: true, roughness: 1 }));
        rock.position.set(Math.cos(a) * r, 0.5, Math.sin(a) * r);
        rock.rotation.set(a, a * 0.5, 0);
        g.add(rock);
      }
    }
    g.position.set(node.x, heightAt(node.x, node.z), node.z);
    return { group: g, amount: -1 };
  }

  // ------------------------------------------------------------------ Sincro

  _sync(force = false) {
    if (!this.root || !this.colony) return;
    const colony = this.colony;

    // Edificios
    const seenB = new Set();
    for (const b of colony.buildings) {
      seenB.add(b.uid);
      let m = this.bMeshes.get(b.uid);
      if (!m) {
        m = this._makeBuildingMesh(b);
        this.bMeshes.set(b.uid, m);
        this.root.add(m.group);
      }
      const p = Math.max(0.001, Math.min(1, b.progress));
      if (m.progress !== p) {
        m.progress = p;
        const done = p >= 0.999;
        m.group.scale.setScalar(done ? 1 : 0.35 + p * 0.65);
        const op = done ? 1 : 0.35 + p * 0.65;
        m.group.traverse((o) => {
          if (!o.isMesh || !o.material) return;
          const base = o.material.userData.baseOpacity ?? 1;
          o.material.opacity = base * op;
          o.material.transparent = o.material.opacity < 1;
        });
      }
      if (m.hp !== b.hp) {
        m.hp = b.hp;
        const damaged = b.hp < 60;
        m.group.traverse((o) => {
          if (!o.isMesh || !o.material || !o.material.emissive) return;
          o.material.emissive.setHex(damaged ? 0x551111 : (o.material.userData.baseEmissive ?? 0x000000));
        });
      }
    }
    for (const [uid, m] of Array.from(this.bMeshes)) {
      if (seenB.has(uid)) continue;
      this.root.remove(m.group);
      disposeObject(m.group);
      this.bMeshes.delete(uid);
    }

    // Unidades
    const seenU = new Set();
    for (const u of colony.units) {
      seenU.add(u.uid);
      let m = this.uMeshes.get(u.uid);
      if (!m) {
        m = this._makeUnitMesh(u);
        this.uMeshes.set(u.uid, m);
        this.root.add(m.group);
      } else if (m.role !== u.role) {
        this.root.remove(m.group);
        disposeObject(m.group);
        m = this._makeUnitMesh(u);
        this.uMeshes.set(u.uid, m);
        this.root.add(m.group);
      }
      m.group.position.set(u.x, heightAt(u.x, u.z), u.z);
      if (u.facing !== undefined) m.group.rotation.y = u.facing;
      // pequeño salto al caminar
      m.body.position.y = 0.72 + Math.abs(Math.sin(this.time * 6 + u.uid)) * 0.06;
    }
    for (const [uid, m] of Array.from(this.uMeshes)) {
      if (seenU.has(uid)) continue;
      this.root.remove(m.group);
      disposeObject(m.group);
      this.uMeshes.delete(uid);
    }

    // Yacimientos
    const seenN = new Set();
    for (const n of colony.nodes) {
      seenN.add(n.uid);
      let m = this.nMeshes.get(n.uid);
      if (!m) {
        m = this._makeNodeMesh(n);
        this.nMeshes.set(n.uid, m);
        this.root.add(m.group);
      }
      const frac = Math.max(0, Math.min(1, n.amount / Math.max(1, n.maxAmount)));
      if (Math.abs(m.amount - frac) > 0.05) {
        m.amount = frac;
        m.group.scale.setScalar(0.45 + frac * 0.55);
      }
    }
    for (const [uid, m] of Array.from(this.nMeshes)) {
      if (seenN.has(uid)) continue;
      this.root.remove(m.group);
      disposeObject(m.group);
      this.nMeshes.delete(uid);
    }

    if (force) this._updateMarker();
  }

  // ------------------------------------------------------------- Interacción

  _onResize() {
    this.camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    this.camera.updateProjectionMatrix();
  }

  _onPointerDown(e) {
    if (!this.active) return;
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this._pointers.size === 2) {
      const pts = Array.from(this._pointers.values());
      this._pinch.active = true;
      this._pinch.dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      this._pinch.cx = (pts[0].x + pts[1].x) / 2;
      this._pinch.cy = (pts[0].y + pts[1].y) / 2;
      return;
    }
    this._pointer = { active: true, id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, t0: performance.now() };
  }

  _onPointerMove(e) {
    if (!this.active) return;
    if (this._pointers.has(e.pointerId)) this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this._pinch.active && this._pointers.size >= 2) {
      const pts = Array.from(this._pointers.values());
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const cx = (pts[0].x + pts[1].x) / 2;
      const cy = (pts[0].y + pts[1].y) / 2;
      if (this._pinch.dist > 0) {
        const k = this._pinch.dist / Math.max(1, d);
        this.view.dist = THREE.MathUtils.clamp(this.view.dist * k, 18, 150);
      }
      this._panPixels(cx - this._pinch.cx, cy - this._pinch.cy);
      this._pinch.dist = d;
      this._pinch.cx = cx;
      this._pinch.cy = cy;
      return;
    }

    if (!this._pointer.active || this._pointer.id !== e.pointerId) return;
    const dx = e.clientX - this._pointer.x;
    const dy = e.clientY - this._pointer.y;
    this._pointer.x = e.clientX;
    this._pointer.y = e.clientY;
    this._pointer.moved += Math.abs(dx) + Math.abs(dy);
    // Arrastrar: girar la cámara alrededor de la colonia
    this.view.yaw -= dx * 0.006;
    this.view.pitch = THREE.MathUtils.clamp(this.view.pitch + dy * 0.004, 0.22, 1.35);
  }

  _onPointerUp(e) {
    if (!this.active) return;
    this._pointers.delete(e.pointerId);
    if (this._pointers.size < 2) this._pinch.active = false;
    if (!this._pointer.active || this._pointer.id !== e.pointerId) return;
    const wasTap = this._pointer.moved < 12 && performance.now() - this._pointer.t0 < 450;
    const at = { x: this._pointer.x, y: this._pointer.y };
    this._pointer.active = false;
    if (!wasTap) return;
    const tile = this.pickTile(at.x, at.y);
    if (tile) {
      this.selectedTile = tile;
      this._updateMarker();
      if (this.pendingType) this.confirmBuild();
      else if (this.onEvent) this.onEvent('select', tile);
    }
  }

  _onWheel(e) {
    if (!this.active) return;
    e.preventDefault();
    let dy = e.deltaY || 0;
    if (e.deltaMode === 1) dy *= 33;
    else if (e.deltaMode === 2) dy *= 400;
    this.view.dist = THREE.MathUtils.clamp(this.view.dist * (1 + dy * 0.0012), 18, 150);
  }

  /** Desplaza el foco con píxeles de pantalla (dos dedos / teclado). */
  _panPixels(dx, dy) {
    if (!dx && !dy) return;
    const k = this.view.dist * 0.0022;
    this._pan(-dx * k, dy * k);
  }

  _pan(right, forward) {
    const s = Math.sin(this.view.yaw);
    const c = Math.cos(this.view.yaw);
    // right = (cos, -sin), forward = (-sin, -cos) en el plano XZ local
    this.view.fx += (c * right - s * forward);
    this.view.fz += (-s * right - c * forward);
    const lim = CITY_RADIUS + 14;
    this.view.fx = THREE.MathUtils.clamp(this.view.fx, -lim, lim);
    this.view.fz = THREE.MathUtils.clamp(this.view.fz, -lim, lim);
  }

  pickTile(clientX, clientY) {
    if (!this.terrain || !this.root) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    _ndc.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    _ndc.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    this._ray.setFromCamera(_ndc, this.camera);
    const hits = this._ray.intersectObject(this.terrain, false);
    if (!hits.length) return null;
    this.root.updateMatrixWorld(true);
    const local = this.root.worldToLocal(hits[0].point.clone());
    const t = localToTile(local.x, local.z);
    if (!inGrid(t.tx, t.tz)) return null;
    return t;
  }

  selectTile(tx, tz) {
    if (!inGrid(tx, tz)) return false;
    this.selectedTile = { tx, tz };
    this._updateMarker();
    return true;
  }

  _updateMarker() {
    if (!this.marker) return;
    const show = !!this.selectedTile;
    this.marker.visible = show;
    if (this.ghost) this.ghost.visible = show && !!this.pendingType;
    if (!show) return;
    const p = tileToLocal(this.selectedTile.tx, this.selectedTile.tz);
    const y = heightAt(p.x, p.z) + 0.1;
    this.marker.position.set(p.x, y, p.z);
    if (this.ghost) this.ghost.position.set(p.x, y + 1.2, p.z);
    const occupied = !!(this.colony && this.colony.buildingAt(this.selectedTile.tx, this.selectedTile.tz));
    const color = this.pendingType ? (occupied ? 0xff5a5a : 0x39ff7a) : 0x00f0ff;
    this.marker.material.color.setHex(color);
    if (this.ghost) this.ghost.material.color.setHex(color);
  }

  setPendingBuild(type) {
    if (!type) { this.pendingType = null; if (this.grid) this.grid.visible = false; this._updateMarker(); return null; }
    const def = BUILDINGS[type];
    if (!def || !this.colony) return null;
    this.pendingType = type;
    if (this.grid) this.grid.visible = true;
    // Si no hay casilla elegida, se propone el mejor sitio automáticamente
    if (!this.selectedTile || !this.colony.canBuild(type, this.selectedTile.tx, this.selectedTile.tz).ok) {
      const spot = this.colony.findSpot(type);
      if (spot) this.selectedTile = spot;
    }
    this._updateMarker();
    return this.selectedTile;
  }

  confirmBuild() {
    if (!this.colony || !this.pendingType) return { ok: false, reason: 'Elige un edificio' };
    const spot = this.selectedTile || this.colony.findSpot(this.pendingType);
    if (!spot) return { ok: false, reason: 'No hay sitio libre' };
    const res = this.colony.build(this.pendingType, spot.tx, spot.tz);
    if (res.ok) {
      this.selectedTile = { tx: spot.tx, tz: spot.tz };
      this.pendingType = null;
      if (this.grid) this.grid.visible = false;
      this._updateMarker();
      this._sync(true);
      if (this.onEvent) this.onEvent('built', res.building);
    }
    return res;
  }

  // -------------------------------------------------------------------- Bucle

  update(delta, input) {
    if (!this.active) return;
    this.time += delta;
    try {
      // Teclado: WASD/flechas mueven el foco, Q/E acercan
      if (input) {
        const k = 26 * delta * (this.view.dist / 56);
        if (input.moveY) this._pan(0, input.moveY * k);
        if (input.moveX) this._pan(input.moveX * k, 0);
        if (input.up) this.view.dist = THREE.MathUtils.clamp(this.view.dist - 30 * delta, 18, 150);
        if (input.down) this.view.dist = THREE.MathUtils.clamp(this.view.dist + 30 * delta, 18, 150);
        if (input.lookX) this.view.yaw -= input.lookX * delta * 0.6;
      }
      this._updateCamera(delta);
      this._sync();
      this._animate(delta);
    } catch (e) {
      if (!this._errorLogged) { console.error('[Civ] update error:', e); this._errorLogged = true; }
    }
  }

  _animate(delta) {
    for (const m of this.bMeshes.values()) {
      if (m.spin) m.spin.rotation.y += delta * 2.2;
      if (m.pulse) {
        const s = 1 + Math.sin(this.time * 3) * 0.12;
        m.pulse.scale.setScalar(s);
      }
      if (m.cart) m.cart.position.x = Math.sin(this.time * 0.8) * 1.8;
      if (m.turretHead) m.turretHead.rotation.y = this.view.yaw * -0.4 + Math.sin(this.time * 0.3) * 0.4;
    }
    if (this.marker && this.marker.visible) {
      const s = 1 + Math.sin(this.time * 4) * 0.06;
      this.marker.scale.setScalar(s);
    }
  }

  _updateCamera(delta) {
    if (!this.root || !this.planet) return;
    this.root.updateMatrixWorld(true);
    const { yaw, pitch, dist, fx, fz } = this.view;
    const cp = Math.cos(pitch);
    _v.set(fx + Math.sin(yaw) * dist * cp, dist * Math.sin(pitch), fz + Math.cos(yaw) * dist * cp);
    this.camera.position.copy(this.root.localToWorld(_v));
    _v2.set(fx, heightAt(fx, fz) + 2.2, fz);
    this.camera.lookAt(this.root.localToWorld(_v2));
    this.camera.updateMatrixWorld(true);
  }

  /** Encuadra la cámara sobre un edificio concreto. */
  focusBuilding(uid) {
    const b = this.colony && this.colony.buildings.find(x => x.uid === uid);
    if (!b) return false;
    this.view.fx = b.x;
    this.view.fz = b.z;
    return true;
  }

  resetView() {
    this.view = { yaw: 0.8, pitch: 0.95, dist: 56, fx: 0, fz: 0 };
  }

  /** Nombre de la era actual de la colonia activa. */
  get eraInfo() {
    if (!this.colony) return ERAS[0];
    return ERAS[this.colony.era] || ERAS[0];
  }
}

export { tileToLocal, localToTile, inGrid };
