import * as THREE from 'three';
import { HealthBar } from '../utils/HealthBar.js';
import { getGlowTexture } from '../utils/textures.js';

const _v = new THREE.Vector3();
const _offColor = new THREE.Color(0x551111);

/**
 * Refinerías: depositan la basura y la convierten en materiales.
 * Tienen integridad: los asteroides las dañan y, a 0, quedan FUERA DE
 * SERVICIO hasta que WALL·E las repara por completo (mantener acción cerca).
 */
export class Refinery {
  constructor(scene, solarSystem, particles = null) {
    this.scene = scene;
    this.solarSystem = solarSystem;
    this.particles = particles;
    this.group = new THREE.Group();
    this.group.name = 'refineries';
    this.stations = [];
    this.elapsed = 0;
    this.onOffline = null;  // (station) => {}
    this.onRestored = null; // (station) => {}
    // Recursos compartidos
    this._baseGeo = new THREE.TorusGeometry(3, 0.4, 10, 28);
    this._baseMat = new THREE.MeshStandardMaterial({ color: 0x444a55, roughness: 0.6, metalness: 0.6 });
    this._coreGeo = new THREE.IcosahedronGeometry(1.2, 1);
    this._ringGeo = new THREE.TorusGeometry(2.2, 0.08, 6, 32);
    try { this.init(); } catch (e) { console.error('[Refinery] init error:', e); }
  }

  init() {
    try {
      const central = this.createStation(new THREE.Vector3(0, 12, -25), 'central', 0xffcc00);
      central.userData.label = 'Refinería Central';
      central.userData.short = 'Central';
    } catch (e) {
      console.error('[Refinery] Estación central falló:', e);
    }

    if (this.solarSystem && this.solarSystem.planets) {
      this.solarSystem.planets.forEach(planet => {
        try {
          const pw = planet.worldPosition;
          const station = this.createStation(new THREE.Vector3(pw.x, pw.y + 6, pw.z + planet.config.radius + 6), planet.config.id, planet.config.color);
          station.planetId = planet.config.id;
          station.planet = planet;
          station.userData.label = `Refinería ${planet.config.name}`;
          station.userData.short = planet.config.name;
        } catch (e) {
          console.error(`[Refinery] Estación ${planet.config.id} falló:`, e);
        }
      });
    }
    this.scene.add(this.group);
  }

  createStation(position, id, color) {
    const st = new THREE.Group();
    st.position.copy(position);

    const base = new THREE.Mesh(this._baseGeo, this._baseMat);
    base.rotation.x = Math.PI / 2;
    st.add(base);

    const coreMat = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.7, roughness: 0.3, metalness: 0.6,
    });
    const core = new THREE.Mesh(this._coreGeo, coreMat);
    core.position.y = 0.5;
    st.add(core);

    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 });
    const ring1 = new THREE.Mesh(this._ringGeo, ringMat);
    ring1.rotation.x = Math.PI / 3;
    const ring2 = new THREE.Mesh(this._ringGeo, ringMat);
    ring2.rotation.x = -Math.PI / 4;
    ring2.rotation.y = Math.PI / 4;
    st.add(ring1, ring2);

    // Halo luminoso (sprite aditivo) en lugar de una PointLight por refinería
    const glowMat = new THREE.SpriteMaterial({
      map: getGlowTexture(), color, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(11);
    glow.position.y = 0.5;
    st.add(glow);

    const bar = new HealthBar(4.5, 0.42);
    bar.group.position.y = 4.4;
    bar.setVisible(false);
    st.add(bar.group);

    st.userData = {
      isRefinery: true,
      id,
      color,
      depositRadius: 8,
      rings: [ring1, ring2],
      core,
      coreMat,
      ringMat,
      glow,
      bar,
      health: 100,
      maxHealth: 100,
      online: true,
      lastHit: -10,
      sparkTimer: 0,
      label: id,
      short: id,
    };

    this.group.add(st);
    this.stations.push(st);
    return st;
  }

  update(delta) {
    this.elapsed += delta;
    const pulse = 1 + Math.sin(this.elapsed * 2) * 0.05;
    for (const st of this.stations) {
      const u = st.userData;
      if (u.online) {
        u.rings[0].rotation.y += delta * 0.8;
        u.rings[1].rotation.y -= delta * 1.1;
        u.core.rotation.y += delta * 0.5;
        u.core.rotation.x += delta * 0.3;
        u.core.scale.setScalar(pulse);
      } else {
        // Fuera de servicio: parpadeo rojo
        const flick = Math.sin(this.elapsed * 9) > 0.2 ? 1 : 0.25;
        u.glow.material.opacity = 0.35 * flick;
      }
      if (st.planet) {
        const pw = st.planet.worldPosition;
        st.position.set(pw.x, pw.y + 6, pw.z + st.planet.config.radius + 6);
      }
      // Chispas si está dañada
      if (this.particles && u.health < 60) {
        u.sparkTimer -= delta;
        if (u.sparkTimer <= 0) {
          u.sparkTimer = u.online ? 0.35 + Math.random() * 0.5 : 0.15 + Math.random() * 0.2;
          _v.set((Math.random() - 0.5) * 4, 0.5 + Math.random(), (Math.random() - 0.5) * 4).add(st.position);
          this.particles.burst(_v, u.online ? 0xffc040 : 0xff5522, 4, 6, 0.3, 0.45);
        }
      }
      const showBar = u.health < u.maxHealth || (this.elapsed - u.lastHit) < 4;
      u.bar.setVisible(showBar);
      if (showBar) u.bar.set(u.health / u.maxHealth, u.online ? null : 'red');
    }
  }

  /** Daña una refinería. Devuelve true si queda fuera de servicio con este golpe. */
  damage(st, amount) {
    const u = st.userData;
    if (!u.online) return false;
    u.health = Math.max(0, u.health - amount);
    u.lastHit = this.elapsed;
    if (u.health <= 0) {
      this._setOnline(st, false);
      if (this.onOffline) { try { this.onOffline(st); } catch (e) { /* noop */ } }
      return true;
    }
    return false;
  }

  /** Repara `amount` puntos. Devuelve 'restored' al volver a estar operativa, 'repairing' o null. */
  repair(st, amount) {
    const u = st.userData;
    if (u.health >= u.maxHealth) return null;
    u.health = Math.min(u.maxHealth, u.health + amount);
    u.lastHit = this.elapsed;
    if (u.health >= u.maxHealth) {
      const wasOffline = !u.online;
      if (wasOffline) {
        this._setOnline(st, true);
        if (this.onRestored) { try { this.onRestored(st); } catch (e) { /* noop */ } }
      }
      return wasOffline ? 'restored' : 'repaired';
    }
    return 'repairing';
  }

  _setOnline(st, online) {
    const u = st.userData;
    u.online = online;
    if (online) {
      u.coreMat.emissive.set(u.color);
      u.coreMat.emissiveIntensity = 0.7;
      u.ringMat.opacity = 0.6;
      u.glow.material.opacity = 0.85;
      u.glow.material.color.set(u.color);
    } else {
      u.coreMat.emissive.copy(_offColor);
      u.coreMat.emissiveIntensity = 0.5;
      u.ringMat.opacity = 0.15;
      u.glow.material.color.set(0xff2222);
    }
  }

  /** Refinería más cercana a una posición: { station, distance } (escribe en out). */
  getNearest(position, out = { station: null, distance: Infinity }, filter = null) {
    out.station = null;
    out.distance = Infinity;
    for (const st of this.stations) {
      if (filter && !filter(st)) continue;
      const d = st.position.distanceTo(position);
      if (d < out.distance) { out.distance = d; out.station = st; }
    }
    return out;
  }

  getOnline() { return this.stations.filter(s => s.userData.online); }

  countDamaged() {
    let n = 0;
    for (const s of this.stations) if (!s.userData.online) n++;
    return n;
  }

  checkDeposit(walle) {
    if (!walle || !walle.canDeposit()) return null;
    for (const st of this.stations) {
      if (!st.userData.online) continue;
      if (st.position.distanceTo(walle.position) < (st.userData.depositRadius || 8)) return st;
    }
    return null;
  }

  processMaterials(materials, count) {
    const refined = { ...(materials || {}) };
    const bonusTypes = ['polymer', 'glass', 'energy', 'concrete'];
    for (let i = 0; i < (count || 0); i++) {
      if (Math.random() < 0.3) {
        const bt = bonusTypes[Math.floor(Math.random() * bonusTypes.length)];
        refined[bt] = (refined[bt] || 0) + 2;
      }
    }
    return refined;
  }

  reset() {
    for (const st of this.stations) {
      const u = st.userData;
      u.health = u.maxHealth;
      if (!u.online) this._setOnline(st, true);
      u.lastHit = -10;
    }
  }
}
