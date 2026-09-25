import * as THREE from 'three';
import { Colony, tileToLocal, localToTile, inGrid } from './Colony.js';
import {
  BUILDINGS, ERAS, GRID, TILE, CITY_RADIUS, TERRAIN_RADIUS, UNIT_TYPES, planetCiv,
} from './CivConfig.js';
import { CivAssets } from './CivAssets.js';
import { CivSky, surfaceHeight } from './CivSky.js';
import {
  buildStructure, buildForestNode, buildVeinNode, buildCrystalNode, buildScatter,
} from './CivStructures.js';
import { buildCitizen, citizenLook, animateCitizen } from './CivActors.js';
import { CivTutorial } from './CivTutorial.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _ndc = new THREE.Vector2();
const _up = new THREE.Vector3(0, 1, 0);
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3();
const _pos = new THREE.Vector3();

/** Sombras de contacto simuladas (un solo InstancedMesh para toda la colonia). */
const MAX_BLOBS = 96;

/** Recuerda la opacidad y el emisivo originales de un material clonado. */
function remember(mat) {
  if (!mat) return mat;
  mat.userData.baseOpacity = mat.opacity;
  mat.userData.baseEmissive = mat.emissive ? mat.emissive.getHex() : 0x000000;
  return mat;
}

/** Altura del terreno: llano dentro de la ciudad, colinas fuera. */
export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  // Dentro de la rejilla el suelo es prácticamente plano (los edificios se
  // apoyan en él sin hundirse); las colinas empiezan ya en el límite de la
  // ciudad y crecen hacia el horizonte.
  const blend = THREE.MathUtils.smoothstep(r, CITY_RADIUS * 0.8, CITY_RADIUS * 1.6);
  const n = Math.sin(x * 0.16) * Math.cos(z * 0.13)
    + Math.sin((x + z) * 0.07) * 0.8
    + Math.cos((x - z) * 0.11) * 0.6;
  return n * 2.4 * blend;
}

/** Altura del suelo en la colonia (relieve local + curvatura del planeta). */
export function groundAt(x, z) {
  return surfaceHeight(x, z, heightAt);
}

/**
 * Pega una geometría plana del plano XZ al relieve (rejilla, aros...). Sin
 * esto, las piezas planas flotan allí donde el terreno se curva.
 */
function hugGround(geo, lift = 0) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, groundAt(pos.getX(i), pos.getZ(i)) + lift);
  }
  pos.needsUpdate = true;
  geo.computeBoundingSphere();
  return geo;
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
    this.assets = new CivAssets({ lowres: !!options.lowres });
    this.camera = new THREE.PerspectiveCamera(52, window.innerWidth / Math.max(1, window.innerHeight), 0.5, 6000);
    this.colonies = new Map();
    this.active = false;
    this.planet = null;
    this.colony = null;
    this.root = null;
    this.env = null;
    this.sky = null;
    this.terrain = null;
    this.lights = null;
    this.grid = null;
    this.marker = null;
    this.ghost = null;
    this.blobs = null;
    this.bMeshes = new Map();
    this.uMeshes = new Map();
    this.nMeshes = new Map();
    this.pendingType = null;
    this.selectedTile = null;
    this.selection = new Set();
    this.selectedBuilding = null;
    this.boxMode = false;
    this.tutorial = null;
    this._tutorialLoaded = false;
    this.view = { yaw: 0.8, pitch: 0.92, dist: 58, fx: 0, fz: 0 };
    this.time = 0;
    this.onEvent = null;
    this.onChanged = null;
    this._pointer = { active: false, id: null, x: 0, y: 0, moved: 0, t0: 0 };
    this._pinch = { active: false, dist: 0, cx: 0, cy: 0 };
    this._pointers = new Map();
    this._box = null;
    this._hidden = [];
    this._ray = new THREE.Raycaster();
    this._bound = {
      down: (e) => this._onPointerDown(e),
      move: (e) => this._onPointerMove(e),
      up: (e) => this._onPointerUp(e),
      wheel: (e) => this._onWheel(e),
      resize: () => this._onResize(),
    };
    this._makeBoxOverlay();
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

  /** Estado del tutorial del primer planeta (null si no se ha empezado). */
  serializeTutorial() { return this.tutorial ? this.tutorial.toJSON() : null; }

  loadTutorial(data) {
    this._tutorialLoaded = true;
    this.tutorial = data ? CivTutorial.fromJSON(data, this.colony) : null;
    return this.tutorial;
  }

  /** Crea (o reengancha) el tutorial del primer planeta aterrizado. */
  _ensureTutorial() {
    if (this._tutorialLoaded || this.tutorial) return this.tutorial;
    if (this.colonies.size !== 1) return null;   // sólo el primer planeta
    try {
      this.tutorial = new CivTutorial(this.colony, { planetId: this.colony.planetId });
    } catch (e) {
      this.tutorial = null;
    }
    return this.tutorial;
  }

  reset() {
    this.exit();
    for (const c of this.colonies.values()) { try { c.events.length = 0; } catch (e) { /* noop */ } }
    this.colonies.clear();
    this.tutorial = null;
    this._tutorialLoaded = false;
  }

  // ----------------------------------------------------------------- Entrar

  enter(planet) {
    if (this.active || !planet) return false;
    try {
      this.planet = planet;
      this.colony = this.getColony(planet.config.id);
      this._ensureTutorial();
      // La guía pertenece al primer planeta: no se muestra en los demás.
      if (this.tutorial && this.tutorial.planetId === this.colony.planetId) {
        this.tutorial.setColony(this.colony);
      }
      this.root = new THREE.Group();
      this.root.name = `civ-${planet.config.id}`;

      // Punto de aterrizaje: el lado del planeta que mira a WALL·E (options)
      const n = (this.options && this.options.landingNormal)
        ? this.options.landingNormal.clone().normalize()
        : new THREE.Vector3(1, 0, 0);
      this.root.quaternion.setFromUnitVectors(_up, n);
      this.root.position.copy(n).multiplyScalar(Math.max(0.5, planet.config.radius - 0.05));
      planet.group.add(this.root);

      // La escena espacial (sol, planetas, anillos, lunas, basura...) se oculta:
      // desde la superficie el sol y los anillos atravesaban el terreno y el
      // resplandor del sol inundaba la pantalla en Mercurio y Venus.
      this._hideSpace();

      this._buildTerrain(planet);
      this._buildSky(planet);
      this._buildLights(planet);
      this._buildGrid();
      this._buildMarker();
      this._buildBlobs();
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
      this.selection.clear();
      this.selectedBuilding = null;
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
    this._restoreSpace();
    this.terrain = null;
    this.grid = null;
    this.marker = null;
    this.ghost = null;
    this.blobs = null;
    this.env = null;
    this.sky = null;
    this.colony = null;
    this.planet = null;
    this.selection.clear();
    this.selectedBuilding = null;
    this._pointers.clear();
    this._hideBox();
  }

  /** Oculta el espacio y devuelve la lista de objetos tocados. */
  _hideSpace() {
    this._hidden = [];
    const keep = new Set();
    for (let p = this.root; p; p = p.parent) keep.add(p);
    const hide = (obj) => {
      if (!obj || keep.has(obj) || !obj.visible) return;
      obj.visible = false;
      this._hidden.push(obj);
    };
    for (const child of this.scene.children) hide(child);
    // Adornos del propio planeta: malla, atmósfera, anillos y luna. La colonia
    // es mucho más grande que el planeta, así que sin esto la esfera del planeta
    // y los anillos de Saturno atravesaban el asentamiento.
    if (this.planet && this.planet.group) {
      for (const child of this.planet.group.children) hide(child);
    }
  }

  _restoreSpace() {
    for (const o of this._hidden) { try { o.visible = true; } catch (e) { /* noop */ } }
    this._hidden = [];
  }

  // ------------------------------------------------------------- Construcción

  _buildTerrain(planet) {
    const theme = planetCiv(planet.config.id);
    const geo = new THREE.CircleGeometry(TERRAIN_RADIUS, 96);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const ground = new THREE.Color(theme.ground);
    const rock = new THREE.Color(theme.rock);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, groundAt(x, z));
      const k = THREE.MathUtils.clamp((pos.getY(i) + 2.4) / 4.8, 0, 1);
      tmp.copy(ground).lerp(rock, k * 0.85);
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const tex = this.assets.groundTexture();
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.96, metalness: 0.02,
      map: tex || null,
    });
    if (tex) { mat.map = tex.clone(); mat.map.needsUpdate = true; mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping; mat.map.repeat.set(16, 16); }
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.name = 'civ-terrain';
    this.root.add(this.terrain);

    // Límite del asentamiento: dos aros brillantes pegados al relieve
    for (const [r0, r1, op] of [[CITY_RADIUS - 0.5, CITY_RADIUS, 0.5], [CITY_RADIUS + 1.6, CITY_RADIUS + 2.1, 0.16]]) {
      const geo = new THREE.RingGeometry(r0, r1, 96);
      geo.rotateX(-Math.PI / 2);
      hugGround(geo, 0.07);
      const ring = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: 0x00f0ff, transparent: true, opacity: op,
          side: THREE.DoubleSide, depthWrite: false,
        })
      );
      ring.name = 'civ-limit';
      this.root.add(ring);
    }

    // Decoración fuera de la ciudad (rocas, matas, cristales)
    const scatter = buildScatter(this.assets, theme, this.assets.lowres ? 14 : 30);
    if (scatter) {
      const mesh = new THREE.Mesh(scatter, this.assets.solidMaterial().clone());
      mesh.name = 'civ-scatter';
      this.root.add(mesh);
    }
  }

  _buildSky(planet) {
    this.sky = new CivSky(this.assets, planetCiv(planet.config.id));
    this.env = this.sky.group;
    this.root.add(this.env);
  }

  _buildLights(planet) {
    const theme = planetCiv(planet.config.id);
    this.lights = new THREE.Group();
    const hemi = new THREE.HemisphereLight(theme.sky, theme.ground, 0.85);
    // La dirección del sol coincide con el disco del cielo (CivSky.SUN_DIR)
    const dir = new THREE.DirectionalLight(0xfff3dd, 1.5);
    dir.position.set(40, 80, 30);
    const fill = new THREE.DirectionalLight(theme.sky, 0.45);
    fill.position.set(-30, 25, -40);
    this.lights.add(hemi, dir, fill);
    this.root.add(this.lights);
  }

  _buildGrid() {
    this.grid = new THREE.GridHelper(GRID * TILE, GRID, 0x00f0ff, 0x00a0c0);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.22;
    this.grid.material.depthWrite = false;
    // La rejilla sigue el relieve: en el borde de la ciudad el suelo baja y
    // unas líneas planas quedarían flotando en el aire.
    hugGround(this.grid.geometry, 0.1);
    this.grid.visible = false;
    this.root.add(this.grid);
  }

  _buildMarker() {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x39ff7a, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false,
    });
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

    // Aro que rodea al edificio elegido (ayuntamiento, granja...)
    this.selRing = new THREE.Mesh(
      new THREE.RingGeometry(TILE * 0.52, TILE * 0.66, 28),
      new THREE.MeshBasicMaterial({
        color: 0xffd166, transparent: true, opacity: 0.85,
        side: THREE.DoubleSide, depthWrite: false,
      })
    );
    this.selRing.rotation.x = -Math.PI / 2;
    this.selRing.visible = false;
    this.root.add(this.selRing);
  }

  /** Sombras de contacto: un único InstancedMesh para todos los civiles. */
  _buildBlobs() {
    const geo = new THREE.CircleGeometry(0.55, this.assets.lowres ? 10 : 18);
    geo.rotateX(-Math.PI / 2);
    const glow = this.assets.glowTexture();
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000, map: glow || null, transparent: true, opacity: 0.34,
      depthWrite: false, fog: false,
    });
    this.blobs = new THREE.InstancedMesh(geo, mat, MAX_BLOBS);
    this.blobs.name = 'civ-blobs';
    this.blobs.count = 0;
    this.blobs.frustumCulled = false;
    this.blobs.renderOrder = 1;
    this.root.add(this.blobs);
  }

  _makeBoxOverlay() {
    try {
      const el = document.createElement('div');
      el.id = 'civ-select-box';
      el.style.display = 'none';
      document.body.appendChild(el);
      this._boxEl = el;
    } catch (e) { this._boxEl = null; }
  }

  // -------------------------------------------------------- Mallas de objetos

  _makeBuildingMesh(building) {
    const def = BUILDINGS[building.type];
    const theme = planetCiv(this.planet.config.id);
    const built = buildStructure(building.type, this.assets, theme, this.assets.lowres);
    const g = new THREE.Group();
    const mats = [];
    if (built.solid) {
      const mesh = new THREE.Mesh(built.solid, this.assets.solidMaterial().clone());
      mesh.castShadow = false;
      g.add(mesh);
      mats.push(remember(mesh.material));
    }
    const parts = [];
    const byName = new Map();
    for (const p of built.parts) {
      const mesh = new THREE.Mesh(p.geo, p.mat.clone());
      mesh.position.set(p.x, p.y, p.z);
      mesh.rotation.set(p.rx, p.ry, p.rz);
      mesh.scale.set(p.sx, p.sy, p.sz);
      if (p.parent && byName.has(p.parent)) byName.get(p.parent).add(mesh);
      else g.add(mesh);
      mats.push(remember(mesh.material));
      const entry = {
        mesh, name: p.name, speed: p.speed, amp: p.amp, axis: p.axis || 'y',
        baseScale: new THREE.Vector3(p.sx, p.sy, p.sz),
        basePos: new THREE.Vector3(p.x, p.y, p.z),
      };
      parts.push(entry);
      if (p.name !== 'child') byName.set(p.name, mesh);
    }
    g.position.set(building.x, groundAt(building.x, building.z), building.z);
    // Cada edificio gira un poco: nada de urbanismo de cuadrícula perfecta
    g.rotation.y = ((building.uid * 37) % 100) / 100 * 0.5 - 0.25;
    const entry = {
      group: g, mats, parts, progress: -1, hp: -1, height: built.height,
      spin: parts.filter(p => p.name === 'spin'),
      head: parts.filter(p => p.name === 'turretHead'),
      pulse: parts.filter(p => p.name === 'pulse'),
      cart: parts.filter(p => p.name === 'cart'),
      flag: parts.filter(p => p.name === 'flag'),
      blink: parts.filter(p => p.name === 'blink'),
    };
    return entry;
  }

  _makeUnitMesh(unit) {
    const look = citizenLook(unit.uid, unit.role);
    const built = buildCitizen(this.assets, {
      role: unit.role, lowres: this.assets.lowres,
      skin: look.skin, hair: look.hair, tunic: look.tunic, scale: look.scale,
    });
    const entry = {
      group: built.group, body: built.body, armL: built.armL, armR: built.armR,
      legL: built.legL, legR: built.legR, carry: built.carry,
      role: unit.role, height: built.height * look.scale, look,
      lastX: unit.x, lastZ: unit.z, speed01: 0,
    };
    return entry;
  }

  _makeNodeMesh(node) {
    const theme = planetCiv(this.planet.config.id);
    const built = node.kind === 'forest'
      ? buildForestNode(this.assets, theme)
      : node.kind === 'crystal'
        ? buildCrystalNode(this.assets, theme)
        : buildVeinNode(this.assets, theme, node.resource);
    const g = new THREE.Group();
    if (built.solid) {
      g.add(new THREE.Mesh(built.solid, this.assets.solidMaterial().clone()));
    }
    const parts = [];
    for (const p of built.parts) {
      const mesh = new THREE.Mesh(p.geo, p.mat.clone());
      mesh.position.set(p.x, p.y, p.z);
      mesh.rotation.set(p.rx, p.ry, p.rz);
      mesh.scale.set(p.sx, p.sy, p.sz);
      g.add(mesh);
      if (p.name === 'pulse') {
        parts.push({ mesh, name: 'pulse', baseScale: new THREE.Vector3(p.sx, p.sy, p.sz) });
      }
    }
    g.position.set(node.x, groundAt(node.x, node.z), node.z);
    return { group: g, amount: -1, parts };
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
        for (const mat of m.mats) {
          if (!mat) continue;
          mat.opacity = (mat.userData.baseOpacity ?? 1) * op;
          mat.transparent = mat.opacity < 1;
        }
      }
      if (m.hp !== b.hp) {
        m.hp = b.hp;
        const damaged = b.hp < 60;
        for (const mat of m.mats) {
          if (!mat || !mat.emissive) continue;
          mat.emissive.setHex(damaged ? 0x551111 : (mat.userData.baseEmissive ?? 0x000000));
        }
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
      m.group.position.set(u.x, groundAt(u.x, u.z), u.z);
      if (u.facing !== undefined) m.group.rotation.y = u.facing;
      const moved = Math.hypot(u.x - m.lastX, u.z - m.lastZ);
      m.lastX = u.x;
      m.lastZ = u.z;
      const speed = (UNIT_TYPES[u.role] || UNIT_TYPES.citizen).speed;
      // velocidad normalizada (suavizada) para el ciclo de andar
      const target = Math.min(1, moved / Math.max(0.0001, speed * 0.05));
      m.speed01 += (target - m.speed01) * 0.25;
      if (m.carry) m.carry.visible = u.carry > 0;
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
      this._endBox();
      return;
    }
    this._pointer = { active: true, id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, t0: performance.now() };
    if (this.boxMode && !this.pendingType) this._startBox(e.clientX, e.clientY);
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
    if (this._box) {
      this._updateBox(e.clientX, e.clientY);
      return;
    }
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
    const box = this._box;
    this._pointer.active = false;
    if (box) {
      this._finishBox(at.x, at.y);
      return;
    }
    if (!wasTap) return;
    this._onTap(at.x, at.y);
  }

  _onWheel(e) {
    if (!this.active) return;
    e.preventDefault();
    let dy = e.deltaY || 0;
    if (e.deltaMode === 1) dy *= 33;
    else if (e.deltaMode === 2) dy *= 400;
    this.view.dist = THREE.MathUtils.clamp(this.view.dist * (1 + dy * 0.0012), 18, 150);
  }

  /** Un toque: civil -> edificio -> yacimiento -> terreno. */
  _onTap(x, y) {
    const unit = this.pickUnit(x, y);
    if (unit !== null) {
      this.toggleUnit(unit);
      return;
    }
    const building = this.pickBuilding(x, y);
    if (building !== null) {
      this.selectBuilding(building);
      return;
    }
    const node = this.pickNode(x, y);
    if (node !== null) {
      const res = this._nodeResource(node);
      if (res && this.selection.size) {
        const r = this.colony.command(Array.from(this.selection), res);
        if (this.onEvent) this.onEvent('command', r);
        return;
      }
      if (res) {
        this.selectedTile = null;
        if (this.onEvent) this.onEvent('node', { node, resource: res });
        return;
      }
    }
    const tile = this.pickTile(x, y);
    if (tile) {
      this.selectedTile = tile;
      this._updateMarker();
      if (this.pendingType) this.confirmBuild();
      else if (this.onEvent) this.onEvent('select', tile);
    }
  }

  /** Recurso que se puede sacar de un yacimiento. */
  _nodeResource(node) {
    if (node.kind === 'forest') return 'wood';
    if (node.kind === 'crystal') return 'crystal';
    return node.resource;
  }

  // --------------------------------------------------------------- Selección

  /** Proyección a pantalla de un punto local de la colonia (px). */
  _project(lx, ly, lz) {
    if (!this.root) return null;
    _v.set(lx, ly, lz);
    this.root.localToWorld(_v);
    _v.project(this.camera);
    if (_v.z > 1) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    return {
      x: (_v.x * 0.5 + 0.5) * rect.width + rect.left,
      y: (-_v.y * 0.5 + 0.5) * rect.height + rect.top,
    };
  }

  /** Civil bajo el punto (en píxeles), o null. */
  pickUnit(clientX, clientY, radiusPx = 38) {
    if (!this.colony || !this.root) return null;
    this.root.updateMatrixWorld(true);
    let best = null;
    let bestD = radiusPx;
    for (const u of this.colony.units) {
      const m = this.uMeshes.get(u.uid);
      const h = m ? m.height : 1.6;
      const p = this._project(u.x, h * 0.55, u.z);
      if (!p) continue;
      const d = Math.hypot(p.x - clientX, p.y - clientY);
      if (d < bestD) { bestD = d; best = u.uid; }
    }
    return best;
  }

  /** Edificio bajo el punto (en píxeles), o null. */
  pickBuilding(clientX, clientY, radiusPx = 46) {
    if (!this.colony || !this.root) return null;
    this.root.updateMatrixWorld(true);
    let best = null;
    let bestD = radiusPx;
    for (const b of this.colony.buildings) {
      const m = this.bMeshes.get(b.uid);
      const h = m ? Math.max(1.5, m.height * 0.5) : 2;
      const p = this._project(b.x, h, b.z);
      if (!p) continue;
      const d = Math.hypot(p.x - clientX, p.y - clientY);
      if (d < bestD) { bestD = d; best = b.uid; }
    }
    return best;
  }

  /** Yacimiento bajo el punto (en píxeles), o null. */
  pickNode(clientX, clientY, radiusPx = 44) {
    if (!this.colony || !this.root) return null;
    this.root.updateMatrixWorld(true);
    let best = null;
    let bestD = radiusPx;
    for (const n of this.colony.nodes) {
      const p = this._project(n.x, 1.0, n.z);
      if (!p) continue;
      const d = Math.hypot(p.x - clientX, p.y - clientY);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  toggleUnit(uid) {
    if (this.selection.has(uid)) this.selection.delete(uid);
    else this.selection.add(uid);
    this.selectedBuilding = null;
    if (this.onEvent) this.onEvent('select-units', this.selectedUnits());
    return Array.from(this.selection);
  }

  selectAllUnits() {
    this.selection.clear();
    if (this.colony) for (const u of this.colony.units) this.selection.add(u.uid);
    this.selectedBuilding = null;
    if (this.onEvent) this.onEvent('select-units', this.selectedUnits());
    return this.selection.size;
  }

  clearSelection() {
    this.selection.clear();
    this.selectedBuilding = null;
    if (this.onEvent) this.onEvent('select-units', []);
  }

  selectedUnits() {
    if (!this.colony) return [];
    return this.colony.units.filter(u => this.selection.has(u.uid));
  }

  selectBuilding(uid) {
    this.selectedBuilding = uid === this.selectedBuilding ? null : uid;
    this.selection.clear();
    const b = this.colony ? this.colony.buildings.find(x => x.uid === uid) : null;
    if (b) { this.view.fx = b.x; this.view.fz = b.z; }
    if (this.onEvent) this.onEvent('select-building', this.selectedBuildingInfo());
    return this.selectedBuilding;
  }

  selectedBuildingInfo() {
    if (!this.colony || !this.selectedBuilding) return null;
    const b = this.colony.buildings.find(x => x.uid === this.selectedBuilding);
    if (!b) return null;
    const def = BUILDINGS[b.type];
    return {
      uid: b.uid, type: b.type, def,
      hp: Math.round(b.hp), progress: b.progress,
      workers: b.workers || 0,
      manual: this.colony.units.filter(u => u.manual && u.task && u.task.kind === 'building' && u.task.uid === b.uid).length,
    };
  }

  /** Manda la selección a recolectar un recurso. */
  commandSelected(resource) {
    if (!this.colony) return { ok: false, reason: 'No hay colonia' };
    if (!this.selection.size) return { ok: false, reason: 'Selecciona civiles primero' };
    const r = this.colony.command(Array.from(this.selection), resource);
    if (this.onEvent) this.onEvent('command', r);
    return r;
  }

  /** Devuelve la selección al reparto automático. */
  releaseSelected() {
    if (!this.colony) return { ok: false, reason: 'No hay colonia' };
    const r = this.colony.release(Array.from(this.selection));
    if (this.onEvent) this.onEvent('command', r);
    return r;
  }

  setBoxMode(on) {
    this.boxMode = !!on;
    if (!this.boxMode) this._endBox();
    if (this.onEvent) this.onEvent('box-mode', this.boxMode);
    return this.boxMode;
  }

  // -------------------------------------------------- Selección con recuadro

  _startBox(x, y) {
    this._box = { x0: x, y0: y, x1: x, y1: y };
    if (this._boxEl) {
      this._boxEl.style.display = 'block';
      this._updateBoxEl();
    }
  }

  _updateBox(x, y) {
    if (!this._box) return;
    this._box.x1 = x;
    this._box.y1 = y;
    this._updateBoxEl();
  }

  _updateBoxEl() {
    if (!this._boxEl || !this._box) return;
    const x = Math.min(this._box.x0, this._box.x1);
    const y = Math.min(this._box.y0, this._box.y1);
    const w = Math.abs(this._box.x1 - this._box.x0);
    const h = Math.abs(this._box.y1 - this._box.y0);
    this._boxEl.style.left = `${x}px`;
    this._boxEl.style.top = `${y}px`;
    this._boxEl.style.width = `${w}px`;
    this._boxEl.style.height = `${h}px`;
  }

  _finishBox(x, y) {
    const box = this._box;
    this._box = null;
    this._hideBox();
    if (!box) return;
    const x0 = Math.min(box.x0, x);
    const x1 = Math.max(box.x0, x);
    const y0 = Math.min(box.y0, y);
    const y1 = Math.max(box.y0, y);
    if (x1 - x0 < 8 && y1 - y0 < 8) { this._onTap(x, y); return; }
    this.selection.clear();
    this.selectedBuilding = null;
    for (const u of this.colony ? this.colony.units : []) {
      const m = this.uMeshes.get(u.uid);
      const h = m ? m.height : 1.6;
      const p = this._project(u.x, h * 0.55, u.z);
      if (!p) continue;
      if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) this.selection.add(u.uid);
    }
    if (this.onEvent) this.onEvent('select-units', this.selectedUnits());
  }

  _endBox() { this._box = null; this._hideBox(); }

  _hideBox() {
    if (this._boxEl) this._boxEl.style.display = 'none';
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
    const y = groundAt(p.x, p.z) + 0.1;
    this.marker.position.set(p.x, y, p.z);
    if (this.ghost) this.ghost.position.set(p.x, y + 1.2, p.z);
    const occupied = !!(this.colony && this.colony.buildingAt(this.selectedTile.tx, this.selectedTile.tz));
    const color = this.pendingType ? (occupied ? 0xff5a5a : 0x39ff7a) : 0x00f0ff;
    this.marker.material.color.setHex(color);
    if (this.ghost) this.ghost.material.color.setHex(color);
  }

  setPendingBuild(type) {
    if (!type) {
      this.pendingType = null;
      if (this.grid) this.grid.visible = false;
      this._updateMarker();
      return null;
    }
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
      if (this.sky) this.sky.update(delta);
      const tut = this.tutorial;
      if (tut && tut.colony === this.colony && tut.update() && this.onEvent) {
        this.onEvent('tutorial', tut.step);
      }
    } catch (e) {
      if (!this._errorLogged) { console.error('[Civ] update error:', e); this._errorLogged = true; }
    }
  }

  _animate(delta) {
    const t = this.time;
    for (const m of this.bMeshes.values()) {
      for (const p of m.spin) {
        const d = delta * 2.2 * (p.speed || 1);
        if (p.axis === 'x') p.mesh.rotation.x += d;
        else if (p.axis === 'z') p.mesh.rotation.z += d;
        else p.mesh.rotation.y += d;
      }
      for (const p of m.head) {
        // El cabezal de la torreta barre el horizonte mirando hacia la cámara
        p.mesh.rotation.y = -this.view.yaw + Math.sin(t * 0.3 + p.mesh.id) * 0.35;
      }
      for (const p of m.pulse) {
        const s = 1 + Math.sin(t * 3 + p.mesh.id) * 0.12;
        p.mesh.scale.copy(p.baseScale).multiplyScalar(s);
      }
      for (const p of m.cart) {
        p.mesh.position.x = p.basePos.x + Math.sin(t * 0.8) * (p.amp || 1.8);
      }
      for (const p of m.flag) {
        p.mesh.rotation.y = Math.sin(t * 2.6 + p.mesh.id) * 0.22;
        p.mesh.scale.set(p.baseScale.x, p.baseScale.y * (1 + Math.sin(t * 5 + p.mesh.id) * 0.08), p.baseScale.z);
      }
      for (const p of m.blink) {
        const mat = p.mesh.material;
        if (!mat) continue;
        const on = Math.sin(t * 4 + p.mesh.id) > 0;
        mat.opacity = on ? 1 : 0.18;
        mat.transparent = true;
        if (mat.emissiveIntensity !== undefined) mat.emissiveIntensity = on ? 2 : 0.4;
      }
    }
    for (const m of this.nMeshes.values()) {
      for (const p of m.parts) {
        const s = 1 + Math.sin(t * 2.2 + p.mesh.id) * 0.14;
        p.mesh.scale.copy(p.baseScale).multiplyScalar(s);
      }
    }
    for (const m of this.uMeshes.values()) {
      animateCitizen(m, delta, t, m.speed01);
    }
    if (this.marker && this.marker.visible) {
      const s = 1 + Math.sin(t * 4) * 0.06;
      this.marker.scale.setScalar(s);
    }
    this._updateSelRing();
    this._updateBlobs();
  }

  /** Aro dorado bajo el edificio seleccionado. */
  _updateSelRing() {
    if (!this.selRing || !this.colony) return;
    const b = this.selectedBuilding
      ? this.colony.buildings.find(x => x.uid === this.selectedBuilding)
      : null;
    this.selRing.visible = !!b;
    if (!b) return;
    this.selRing.position.set(b.x, groundAt(b.x, b.z) + 0.14, b.z);
    const s = 1 + Math.sin(this.time * 3.5) * 0.05;
    this.selRing.scale.setScalar(s);
  }

  /** Coloca las sombras de contacto bajo cada civil (1 draw call). */
  _updateBlobs() {
    if (!this.blobs) return;
    let n = 0;
    for (const m of this.uMeshes.values()) {
      if (n >= MAX_BLOBS) break;
      const g = m.group;
      const s = (m.look && m.look.scale) || 1;
      _pos.set(g.position.x, groundAt(g.position.x, g.position.z) + 0.06, g.position.z);
      _euler.set(-Math.PI / 2, 0, 0);
      _quat.setFromEuler(_euler);
      _scale.setScalar(1.05 * s);
      _mat4.compose(_pos, _quat, _scale);
      this.blobs.setMatrixAt(n, _mat4);
      n++;
    }
    this.blobs.count = n;
    this.blobs.instanceMatrix.needsUpdate = true;
  }

  _updateCamera(delta) {
    if (!this.root || !this.planet) return;
    this.root.updateMatrixWorld(true);
    const { yaw, pitch, dist, fx, fz } = this.view;
    const cp = Math.cos(pitch);
    _v.set(fx + Math.sin(yaw) * dist * cp, dist * Math.sin(pitch), fz + Math.cos(yaw) * dist * cp);
    this.camera.position.copy(this.root.localToWorld(_v));
    _v2.set(fx, groundAt(fx, fz) + 2.2, fz);
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
