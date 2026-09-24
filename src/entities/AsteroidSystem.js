import * as THREE from 'three';
import { loadModel, extractCenteredGeometries } from '../utils/ModelLibrary.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _near = { station: null, distance: 0 };

/**
 * AsteroidSystem - Lluvias de asteroides (modelo assets/asteroides) que se
 * dirigen contra las refinerías. Si impactan, dañan la refinería y, si su
 * integridad llega a 0, queda FUERA DE SERVICIO hasta que WALL·E la repare.
 *
 * Ciclo: primera oleada a los ~55 s de juego y luego cada 70–110 s.
 * Destruirlos da créditos y fragmentos de roca (hormigón) y metal.
 */
export class AsteroidSystem {
  constructor(scene, refinery, particles, trashSystem, quality) {
    this.scene = scene;
    this.refinery = refinery;
    this.particles = particles;
    this.trashSystem = trashSystem;
    this.quality = quality || {};
    this.asteroids = [];
    this.group = new THREE.Group();
    this.group.name = 'asteroids';
    this.scene.add(this.group);

    this.enabled = false;
    this.timer = 55;           // segundos hasta la primera oleada
    this.wave = 0;
    this.waveActive = false;
    this.toSpawn = 0;
    this.spawnTimer = 0;
    this.waveTarget = null;
    this.waveImpacts = 0;
    this.waveDestroyed = 0;
    this.waveOrigin = new THREE.Vector3();

    // Callbacks para Game/HUD
    this.onWaveStart = null;   // (target, count) => {}
    this.onWaveEnd = null;     // ({ defended, impacts, destroyed }) => {}
    this.onImpact = null;      // (station, damage, knockedOut) => {}
    this.onDestroyed = null;   // (asteroid, pos) => {}

    // Geometrías de respaldo hasta que cargue el GLB
    this.geometries = [];
    for (let i = 0; i < 3; i++) this.geometries.push(this._makeFallbackGeometry(i));
    this.material = new THREE.MeshStandardMaterial({
      color: 0x8a7a6a, roughness: 0.95, metalness: 0.05, flatShading: true,
      emissive: 0x3a1500, emissiveIntensity: 0.6,
    });

    loadModel('asteroids').then((gltf) => {
      const parts = extractCenteredGeometries(gltf);
      if (!parts.length) return;
      this.geometries = parts.map(p => p.geometry);
      const src = parts[0].material;
      if (src && src.isMeshStandardMaterial) {
        const m = src.clone();
        // Brillo incandescente sutil: se leen como amenaza a distancia
        m.emissive = new THREE.Color(0x3a1500);
        m.emissiveIntensity = 0.55;
        this.material = m;
      }
      for (const a of this.asteroids) {
        a.mesh.geometry = this.geometries[a.geoIndex % this.geometries.length];
        a.mesh.material = this.material;
      }
    });
  }

  _makeFallbackGeometry(seed) {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      _v1.fromBufferAttribute(pos, i);
      const n = 0.78 + 0.3 * Math.abs(Math.sin(_v1.x * (3 + seed) + _v1.y * 5.3 + _v1.z * (2 + seed)));
      _v1.multiplyScalar(n);
      pos.setXYZ(i, _v1.x, _v1.y, _v1.z);
    }
    g.computeVertexNormals();
    return g;
  }

  setEnabled(v) { this.enabled = !!v; }

  get timeToNextWave() { return this.waveActive ? 0 : Math.max(0, this.timer); }

  _chooseTarget(playerPos) {
    const online = this.refinery ? this.refinery.getOnline() : [];
    if (!online.length) return null;
    // 70 %: una de las 3 refinerías operativas más cercanas al jugador (defendible)
    if (playerPos && Math.random() < 0.7) {
      const sorted = online
        .map(s => ({ s, d: s.position.distanceTo(playerPos) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 3);
      return sorted[Math.floor(Math.random() * sorted.length)].s;
    }
    return online[Math.floor(Math.random() * online.length)];
  }

  startWave(playerPos) {
    const target = this._chooseTarget(playerPos);
    if (!target) { this.timer = 30; return; }
    this.wave++;
    this.waveActive = true;
    this.waveTarget = target;
    this.waveImpacts = 0;
    this.waveDestroyed = 0;
    const base = this.quality.asteroidsPerWave || 4;
    this.toSpawn = base + Math.min(3, Math.floor((this.wave - 1) / 2));
    this.spawnTimer = 0;
    // Dirección de llegada: cerca del plano de la eclíptica
    const a = Math.random() * Math.PI * 2;
    this.waveOrigin.set(Math.cos(a), (Math.random() - 0.5) * 0.5, Math.sin(a)).normalize();
    if (this.onWaveStart) { try { this.onWaveStart(target, this.toSpawn); } catch (e) { /* noop */ } }
  }

  _spawnAsteroid(target, radius = null, position = null, velocity = null, isFragment = false) {
    const r = radius || (1.2 + Math.random() * 1.4);
    const geoIndex = Math.floor(Math.random() * 1000);
    const mesh = new THREE.Mesh(this.geometries[geoIndex % this.geometries.length], this.material);
    mesh.scale.setScalar(r);
    if (position) {
      mesh.position.copy(position);
    } else {
      const dist = 120 + Math.random() * 40;
      _v1.copy(this.waveOrigin);
      _v1.x += (Math.random() - 0.5) * 0.35;
      _v1.y += (Math.random() - 0.5) * 0.2;
      _v1.z += (Math.random() - 0.5) * 0.35;
      _v1.normalize();
      mesh.position.copy(target.position).addScaledVector(_v1, dist);
    }
    mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    const speed = 7 + Math.random() * 4;
    const vel = velocity ? velocity.clone() : _v2.subVectors(target.position, mesh.position).normalize().multiplyScalar(speed).clone();
    const a = {
      mesh,
      geoIndex,
      radius: r,
      hp: 30 + 40 * (r - 1),
      maxHp: 30 + 40 * (r - 1),
      velocity: vel,
      speed,
      target,
      alive: true,
      isFragment,
      spin: new THREE.Vector3((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5),
      trailTimer: 0,
      life: 70, // por si su objetivo desaparece
    };
    this.group.add(mesh);
    this.asteroids.push(a);
    return a;
  }

  _remove(a) {
    a.alive = false;
    this.group.remove(a.mesh);
    const i = this.asteroids.indexOf(a);
    if (i >= 0) this.asteroids.splice(i, 1);
  }

  /** Daño de los proyectiles del jugador. */
  damage(a, amount) {
    if (!a.alive) return false;
    a.hp -= amount;
    if (a.hp > 0) return false;
    const pos = a.mesh.position.clone();
    if (this.particles) this.particles.explosion(pos, 0xffa040, 0.6 + a.radius * 0.35);
    this._remove(a);
    this.waveDestroyed++;
    // Los grandes se parten en dos fragmentos que siguen su curso
    if (a.radius > 2.2 && a.target) {
      for (let i = 0; i < 2; i++) {
        _v1.set((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).normalize();
        const v = a.velocity.clone().addScaledVector(_v1, 4);
        this._spawnAsteroid(a.target, a.radius * 0.55, _v2.copy(pos).addScaledVector(_v1, a.radius * 0.6), v, true);
      }
    }
    if (this.trashSystem) this.trashSystem.spawnNear(pos, a.isFragment ? 1 : 2, ['rock', 'rock', 'satellite']);
    if (this.onDestroyed) { try { this.onDestroyed(a, pos); } catch (e) { /* noop */ } }
    return true;
  }

  update(delta, walle) {
    if (this.enabled && !this.waveActive) {
      this.timer -= delta;
      if (this.timer <= 0) this.startWave(walle ? walle.position : null);
    }

    if (this.waveActive && this.toSpawn > 0) {
      this.spawnTimer -= delta;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = 1.2;
        this.toSpawn--;
        if (this.waveTarget) this._spawnAsteroid(this.waveTarget);
      }
    }

    for (let i = this.asteroids.length - 1; i >= 0; i--) {
      const a = this.asteroids[i];
      if (!a.alive) continue;
      const m = a.mesh;
      a.life -= delta;
      if (a.life <= 0) { this._remove(a); continue; }
      // Guiado suave hacia la refinería (que se mueve con su planeta)
      if (a.target) {
        _v1.subVectors(a.target.position, m.position);
        const d = _v1.length();
        _v1.multiplyScalar(a.speed / (d || 1));
        a.velocity.lerp(_v1, Math.min(1, delta * 0.6));
        if (d < a.radius + 3.5) {
          this._impact(a);
          continue;
        }
      }
      m.position.addScaledVector(a.velocity, delta);
      m.rotation.x += a.spin.x * delta;
      m.rotation.y += a.spin.y * delta;
      m.rotation.z += a.spin.z * delta;

      // Estela de fuego (visible desde lejos)
      a.trailTimer -= delta;
      if (this.particles && a.trailTimer <= 0) {
        a.trailTimer = 0.05;
        _v2.copy(a.velocity).normalize().multiplyScalar(-a.radius * 0.9).add(m.position);
        this.particles.trail(_v2, 0xff7a30, a.radius * 1.6, 0.7, 0.55);
      }

      // Choque con WALL·E
      if (walle) {
        const minD = a.radius + 1.6;
        if (m.position.distanceToSquared(walle.position) < minD * minD) {
          walle.takeDamage(6 * a.radius);
          _v1.subVectors(walle.position, m.position).normalize();
          walle.velocity.addScaledVector(_v1, 10);
          this.damage(a, 9999);
        }
      }
    }

    if (this.waveActive && this.toSpawn <= 0 && this.asteroids.length === 0) this._endWave();
  }

  _impact(a) {
    const st = a.target;
    const dmg = 14 + 10 * a.radius;
    let knockedOut = false;
    if (st && this.refinery) knockedOut = this.refinery.damage(st, dmg);
    if (this.particles) this.particles.explosion(a.mesh.position, 0xff5522, 0.8 + a.radius * 0.4);
    this.waveImpacts++;
    this._remove(a);
    if (this.onImpact) { try { this.onImpact(st, dmg, knockedOut); } catch (e) { /* noop */ } }
    // Si la refinería quedó fuera de servicio, el resto busca otra operativa cercana
    if (knockedOut && this.refinery) {
      const next = this.refinery.getNearest(st.position, _near, s => s.userData.online).station;
      for (const other of this.asteroids) if (other.target === st) other.target = next;
      if (this.waveTarget === st) this.waveTarget = next;
    }
  }

  _endWave() {
    this.waveActive = false;
    this.timer = 70 + Math.random() * 40;
    const result = { defended: this.waveImpacts === 0, impacts: this.waveImpacts, destroyed: this.waveDestroyed, wave: this.wave };
    this.waveTarget = null;
    if (this.onWaveEnd) { try { this.onWaveEnd(result); } catch (e) { /* noop */ } }
  }

  reset() {
    for (const a of this.asteroids) this.group.remove(a.mesh);
    this.asteroids = [];
    this.waveActive = false;
    this.toSpawn = 0;
    this.timer = 55;
    this.wave = 0;
    this.waveTarget = null;
  }
}
