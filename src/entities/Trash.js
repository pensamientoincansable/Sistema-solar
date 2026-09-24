import * as THREE from 'three';
import { TRASH_TYPES } from '../config/PlanetsConfig.js';
import { getGlowTexture } from '../utils/textures.js';
import { loadModel, extractCenteredGeometries } from '../utils/ModelLibrary.js';

const _v = new THREE.Vector3();
const _closest = { planet: null, distance: Infinity };

function makeGeometry(cfg) {
  const s = cfg.scale;
  switch (cfg.model) {
    case 'cube': return new THREE.BoxGeometry(s, s, s);
    // Antes era un PlaneGeometry de una sola cara: invisible visto por detrás
    case 'plane': return new THREE.BoxGeometry(s * 1.5, s, 0.08);
    case 'cylinder': return new THREE.CylinderGeometry(s * 0.4, s * 0.4, s * 1.8, 10);
    case 'sphere': return new THREE.SphereGeometry(s * 0.6, 12, 10);
    case 'octahedron': return new THREE.OctahedronGeometry(s * 0.8, 0);
    case 'icosahedron': return new THREE.IcosahedronGeometry(s * 0.7, 0);
    case 'capsule': return new THREE.CapsuleGeometry(s * 0.38, s * 0.9, 4, 10);
    case 'torus': return new THREE.TorusGeometry(s * 0.5, s * 0.18, 8, 16);
    case 'tetra': return new THREE.TetrahedronGeometry(s * 0.85, 0);
    case 'dodeca': return new THREE.DodecahedronGeometry(s * 0.75, 0);
    default: return new THREE.BoxGeometry(1, 1, 1);
  }
}

/**
 * TrashSystem - Basura espacial.
 * Geometrías y materiales se comparten por tipo (antes cada pieza creaba y
 * destruía los suyos): menos memoria, menos trabajo para el recolector de
 * basura de JS y sin recompilar programas de shader.
 */
export class TrashSystem {
  constructor(scene, solarSystem, qualitySettings) {
    this.scene = scene;
    this.solarSystem = solarSystem;
    this.quality = qualitySettings || { trashCount: 100, renderDistance: 800 };
    this.trashList = [];
    this.group = new THREE.Group();
    this.group.name = 'trash';
    this.scene.add(this.group);
    this.resources = new Map();
    this._randomTypes = TRASH_TYPES.filter(t => t.random !== false);

    try { this.spawnInitial(); } catch (e) { console.error('[Trash] spawnInitial error:', e); }
    this._loadResourceModels();
  }

  _res(cfg) {
    let r = this.resources.get(cfg.id);
    if (!r) {
      r = {
        geometry: makeGeometry(cfg),
        material: new THREE.MeshStandardMaterial({
          color: cfg.color, roughness: 0.55, metalness: 0.45,
          emissive: cfg.color, emissiveIntensity: 0.18,
        }),
        // Brillo suave (sprite) para localizar la basura: antes era una esfera
        // translúcida de borde duro que se veía como una mancha
        haloMaterial: new THREE.SpriteMaterial({
          map: getGlowTexture(), color: cfg.color, transparent: true, opacity: 0.5,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      };
      this.resources.set(cfg.id, r);
    }
    return r;
  }

  getType(id) { return TRASH_TYPES.find(t => t.id === id) || null; }

  /**
   * Sustituye las geometrías provisionales por los modelos optimizados de
   * /assets/esferas metal, /assets/glass_sphere, /assets/polímero y /assets/musgo.
   * Si una descarga falla, la geometría procedural ya creada sigue funcionando.
   */
  _loadResourceModels() {
    const keys = [...new Set(TRASH_TYPES.map(t => t.assetKey).filter(Boolean))];
    for (const key of keys) {
      loadModel(key).then((gltf) => {
        const part = extractCenteredGeometries(gltf)[0];
        if (!part || !part.geometry) return;
        for (const cfg of TRASH_TYPES.filter(t => t.assetKey === key)) {
          const resource = this.resources.get(cfg.id);
          if (resource) resource.geometry = part.geometry;
          for (const trash of this.trashList) {
            if (trash.config.id === cfg.id) trash.mesh.geometry = part.geometry;
          }
        }
      }).catch(() => { /* el respaldo procedural es intencionado */ });
    }
  }

  /** Tipo aleatorio para un material concreto (o cualquiera si no hay candidatos). */
  typeForMaterial(material) {
    const candidates = TRASH_TYPES.filter(t => t.material === material);
    if (candidates.length) return candidates[Math.floor(Math.random() * candidates.length)];
    return this._randomTypes[Math.floor(Math.random() * this._randomTypes.length)];
  }

  _pickWeightedMaterial(materials, planet) {
    if (!materials || !materials.length) return null;
    const weights = planet?.config?.resourceWeights || {};
    const total = materials.reduce((sum, material) => sum + Math.max(0.05, Number(weights[material]) || 1), 0);
    let roll = Math.random() * total;
    for (const material of materials) {
      roll -= Math.max(0.05, Number(weights[material]) || 1);
      if (roll <= 0) return material;
    }
    return materials[materials.length - 1];
  }

  createTrash(position, type = null, planetId = null, valueOverride = null) {
    try {
      const cfg = type || this._randomTypes[Math.floor(Math.random() * this._randomTypes.length)];
      const res = this._res(cfg);
      const mesh = new THREE.Mesh(res.geometry, res.material);
      mesh.position.copy(position);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      mesh.userData.isTrash = true;

      const halo = new THREE.Sprite(res.haloMaterial);
      halo.scale.setScalar(cfg.scale * 2.6);
      halo.visible = false;
      mesh.add(halo);

      const trashObj = {
        mesh,
        halo,
        config: cfg,
        planetId,
        velocity: new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 1, (Math.random() - 0.5) * 2),
        rotationSpeed: new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2),
        collected: false,
        value: Number.isFinite(valueOverride) ? Math.max(1, valueOverride) : cfg.value,
        resourceAmount: Number.isFinite(valueOverride) ? Math.max(1, valueOverride) : 1,
        grouped: Number.isFinite(valueOverride) && valueOverride !== cfg.value,
      };

      this.group.add(mesh);
      this.trashList.push(trashObj);
      return trashObj;
    } catch (e) {
      console.error('[Trash] createTrash error:', e);
      return null;
    }
  }

  /** Elimina una pieza (recogida, robada por un OVNI o destruida). No libera recursos compartidos. */
  removeTrash(t) {
    if (!t || t.collected) return;
    t.collected = true;
    this.group.remove(t.mesh);
    const idx = this.trashList.indexOf(t);
    if (idx >= 0) {
      // swap-remove: O(1)
      const last = this.trashList.pop();
      if (idx < this.trashList.length) this.trashList[idx] = last;
    }
  }

  _pickPlanet(planets) {
    let total = 0;
    for (const p of planets) total += p.config.trashRichness || 1;
    let r = Math.random() * total;
    for (const p of planets) {
      r -= p.config.trashRichness || 1;
      if (r <= 0) return p;
    }
    return planets[planets.length - 1];
  }

  _spawnAroundPlanet(planet) {
    const pp = planet.worldPosition;
    const angle = Math.random() * Math.PI * 2;
    const dist = planet.config.radius + 5 + Math.random() * 25;
    _v.set(pp.x + Math.cos(angle) * dist, (Math.random() - 0.5) * 12, pp.z + Math.sin(angle) * dist);
    let type = null;
    const mats = planet.config.trashMaterials;
    if (mats && mats.length && Math.random() < 0.82) {
      // La Tierra favorece biomasa: facilita el desbloqueo sin convertirla en
      // un recurso garantizado ni inflar el número total de objetos.
      type = this.typeForMaterial(this._pickWeightedMaterial(mats, planet));
    }
    return this.createTrash(_v, type, planet.config.id);
  }

  _spawnBelt() {
    const r = 95 + Math.random() * 20;
    const a = Math.random() * Math.PI * 2;
    _v.set(Math.cos(a) * r, (Math.random() - 0.5) * 10, Math.sin(a) * r);
    const roll = Math.random();
    const type = roll < 0.5 ? this.getType('rock') : roll < 0.8 ? this.typeForMaterial('metal') : this.getType('crystal');
    return this.createTrash(_v, type, 'belt');
  }

  spawnInitial() {
    const count = this.quality.trashCount || 100;
    const planets = this.solarSystem ? this.solarSystem.planets : [];

    if (planets.length === 0) {
      for (let i = 0; i < count; i++) {
        _v.set((Math.random() - 0.5) * 200, (Math.random() - 0.5) * 100, (Math.random() - 0.5) * 200);
        this.createTrash(_v);
      }
      return;
    }

    for (let i = 0; i < count; i++) {
      try { this._spawnAroundPlanet(this._pickPlanet(planets)); } catch (e) { /* skip */ }
    }
    // Cinturón de asteroides entre Marte y Júpiter: rocas (hormigón), metal y cristal
    const belt = Math.round(Math.max(14, count * 0.25));
    for (let i = 0; i < belt; i++) {
      try { this._spawnBelt(); } catch (e) { /* skip */ }
    }
  }

  /**
   * Genera un paquete único con varias unidades del mismo recurso. Mantiene la
   * bodega legible: un asteroide no llena 20 huecos, pero sí entrega 20 unidades.
   */
  spawnResourceDrop(position, material, amount = 1, planetId = null) {
    const type = this.typeForMaterial(material) || this.getType('rock');
    if (!position || !type || !Number.isFinite(amount) || amount <= 0) return null;
    const drop = this.createTrash(position, type, planetId, Math.round(amount));
    if (drop) {
      drop.resource = material;
      drop.value = Math.round(amount);
      drop.resourceAmount = Math.round(amount);
      drop.grouped = true;
      drop.mesh.scale.multiplyScalar(1 + Math.min(0.55, Math.log10(Math.max(1, amount)) * 0.16));
    }
    return drop;
  }

  /** Genera basura alrededor de un punto. `typeIds` opcional: lista de ids a elegir. */
  spawnNear(position, amount = 3, typeIds = null) {
    if (!position) return;
    for (let i = 0; i < amount; i++) {
      try {
        _v.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10).add(position);
        let type = null;
        if (typeIds && typeIds.length) {
          const requested = typeIds[Math.floor(Math.random() * typeIds.length)];
          type = this.getType(requested) || this.typeForMaterial(requested);
        }
        const t = this.createTrash(_v, type);
        if (t) t.velocity.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
      } catch (e) { /* skip */ }
    }
  }

  update(delta, wallePos, walle = null) {
    const rd = this.quality.renderDistance || 800;
    const rd2 = rd * rd;
    const magnetR = walle && !walle.cargoFull ? walle.magnetRadius : 0;
    const magnetR2 = magnetR * magnetR;
    const damp = 1 - 0.08 * delta;
    const list = this.trashList;
    for (let i = list.length - 1; i >= 0; i--) {
      const t = list[i];
      if (t.collected) continue;
      const m = t.mesh;
      const p = m.position;

      p.addScaledVector(t.velocity, delta * 0.3);
      t.velocity.multiplyScalar(damp);

      if (this.solarSystem) {
        const info = this.solarSystem.getClosestPlanetInfo(p, _closest);
        if (info.planet && info.distance < 60) {
          const r = info.planet.config.radius;
          _v.copy(info.planet.worldPosition).sub(p);
          const d = info.distance || 1;
          if (d < r + 3) {
            // Demasiado cerca de la superficie: empujar hacia fuera
            t.velocity.addScaledVector(_v, -2.0 * delta / d);
          } else if (d > r + 8) {
            t.velocity.addScaledVector(_v, 0.25 * delta / d);
          }
        }
      }

      let dist2 = 0;
      if (wallePos) {
        dist2 = p.distanceToSquared(wallePos);
        // Imán de recolección: atrae la basura hacia WALL·E
        if (dist2 < magnetR2) {
          const d = Math.sqrt(dist2) || 1;
          const speed = (14 + (magnetR - d) * 3) * delta;
          p.addScaledVector(_v.copy(wallePos).sub(p), Math.min(1, speed / d));
        }
      }
      const visible = dist2 < rd2;
      m.visible = visible;
      if (visible) {
        m.rotation.x += t.rotationSpeed.x * delta;
        m.rotation.y += t.rotationSpeed.y * delta;
        m.rotation.z += t.rotationSpeed.z * delta;
        t.halo.visible = dist2 < 3600;
      }
    }
  }

  /**
   * Recoge la basura dentro del radio. Devuelve { collected, full }.
   */
  checkCollection(walle, radius = null) {
    const R = radius || walle.pickupRadius || 4.5;
    const R2 = R * R;
    let collected = 0;
    let full = false;
    const list = this.trashList;
    for (let i = list.length - 1; i >= 0; i--) {
      const t = list[i];
      if (t.collected) continue;
      if (t.mesh.position.distanceToSquared(walle.position) >= R2) continue;
      if (!walle.collectTrash(t)) { full = true; break; }
      this.removeTrash(t);
      collected++;
      // Reaparición para mantener la densidad
      if (Math.random() < 0.65 && this.solarSystem && this.solarSystem.planets.length) {
        try { this._spawnAroundPlanet(this._pickPlanet(this.solarSystem.planets)); } catch (e) { /* skip */ }
      }
    }
    return { collected, full };
  }

  reset() {
    for (const t of this.trashList) this.group.remove(t.mesh);
    this.trashList = [];
    try { this.spawnInitial(); } catch (e) { console.error('[Trash] reset error:', e); }
  }

  getCount() { return this.trashList.length; }
}
