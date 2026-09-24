import * as THREE from 'three';
import { WEAPONS } from '../config/ShopConfig.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _prev = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _desired = new THREE.Vector3();

/** ¿El segmento a→b pasa a menos de r del punto c? */
function segmentHitsSphere(a, b, c, r) {
  _v1.subVectors(b, a);
  const len2 = _v1.lengthSq();
  let t = 0;
  if (len2 > 1e-8) {
    t = _v2.subVectors(c, a).dot(_v1) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
  }
  _v2.copy(a).addScaledVector(_v1, t);
  return _v2.distanceToSquared(c) <= r * r;
}

/**
 * CombatSystem - Proyectiles del jugador (4 armas) y de los OVNIs.
 *
 * Todo sale de pools: las mallas se crean una vez y se reutilizan
 * (antes: geometría + material + PointLight nuevas por disparo y setTimeout
 * por destello, lo que provocaba recompilaciones de shaders y tirones).
 */
export class CombatSystem {
  constructor(scene, particles = null) {
    this.scene = scene;
    this.particles = particles;
    this.projectiles = [];
    this.group = new THREE.Group();
    this.group.name = 'projectiles';
    this.scene.add(this.group);
    this._pools = {};
    this._objPool = [];
    this.maxProjectiles = 160;

    // Callbacks (Game): impactos y bajas
    this.onPlayerHit = null;    // (damage) => {}

    const glow = (color, opacity) => new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this._defs = {
      laser: { geometry: new THREE.CapsuleGeometry(0.07, 1.5, 3, 6), material: glow(WEAPONS.laser.color, 0.95), orient: true },
      scatter: { geometry: new THREE.CapsuleGeometry(0.07, 0.8, 3, 6), material: glow(WEAPONS.scatter.color, 0.95), orient: true },
      plasma: { geometry: new THREE.SphereGeometry(0.42, 12, 10), material: glow(WEAPONS.plasma.color, 0.9), halo: { geometry: new THREE.SphereGeometry(0.85, 10, 8), material: glow(WEAPONS.plasma.color, 0.25) } },
      missile: { geometry: new THREE.ConeGeometry(0.22, 1.1, 8), material: new THREE.MeshBasicMaterial({ color: 0xfff2a8 }), orient: true },
      enemy: { geometry: new THREE.SphereGeometry(0.28, 10, 8), material: glow(0xff3344, 0.95), halo: { geometry: new THREE.SphereGeometry(0.6, 10, 8), material: glow(0xff3344, 0.3) } },
    };
  }

  _acquireMesh(type) {
    const pool = this._pools[type] || (this._pools[type] = []);
    let mesh = pool.pop();
    if (!mesh) {
      const def = this._defs[type];
      mesh = new THREE.Mesh(def.geometry, def.material);
      if (def.halo) mesh.add(new THREE.Mesh(def.halo.geometry, def.halo.material));
      mesh.userData.type = type;
      this.group.add(mesh);
    }
    mesh.visible = true;
    return mesh;
  }

  _releaseMesh(mesh) {
    mesh.visible = false;
    const pool = this._pools[mesh.userData.type] || (this._pools[mesh.userData.type] = []);
    pool.push(mesh);
  }

  _spawn(type, owner, origin, dir, speed, damage, life, radius) {
    if (this.projectiles.length >= this.maxProjectiles) this._kill(0);
    const p = this._objPool.pop() || { velocity: new THREE.Vector3() };
    p.mesh = this._acquireMesh(type);
    p.mesh.position.copy(origin);
    p.type = type;
    p.owner = owner;
    p.velocity.copy(dir).normalize().multiplyScalar(speed);
    p.speed = speed;
    p.damage = damage;
    p.life = life;
    p.radius = radius;
    p.splash = 0;
    p.homing = 0;
    p.maxSpeed = speed;
    p.target = null;
    p.trailTimer = 0;
    if (this._defs[type].orient) p.mesh.quaternion.setFromUnitVectors(_up, _v1.copy(dir).normalize());
    this.projectiles.push(p);
    return p;
  }

  _kill(i) {
    const p = this.projectiles[i];
    this._releaseMesh(p.mesh);
    p.mesh = null;
    p.target = null;
    const last = this.projectiles.pop();
    if (i < this.projectiles.length) this.projectiles[i] = last;
    this._objPool.push(p);
  }

  /**
   * Dispara el arma `weaponId` desde `origin` hacia `direction`.
   * `opts`: { damageMul, target } (target = objetivo inicial de los misiles).
   */
  fire(weaponId, origin, direction, opts = {}) {
    const w = WEAPONS[weaponId];
    if (!w) return;
    const dmgMul = opts.damageMul || 1;
    if (weaponId === 'scatter') {
      // Base ortonormal alrededor de la dirección para repartir los perdigones
      const d = _desired.copy(direction).normalize();
      const side = new THREE.Vector3().crossVectors(d, Math.abs(d.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : _up).normalize();
      const up = new THREE.Vector3().crossVectors(side, d).normalize();
      for (let i = 0; i < w.pellets; i++) {
        const a = (i / w.pellets) * Math.PI * 2 + Math.random() * 0.5;
        const r = w.spread * (0.4 + Math.random() * 0.6);
        const dir = new THREE.Vector3().copy(d)
          .addScaledVector(side, Math.cos(a) * r)
          .addScaledVector(up, Math.sin(a) * r)
          .normalize();
        this._spawn('scatter', 'player', origin, dir, w.speed * (0.92 + Math.random() * 0.16), w.damage * dmgMul, w.life, w.radius);
      }
    } else {
      const p = this._spawn(weaponId, 'player', origin, direction, w.speed, w.damage * dmgMul, w.life, w.radius);
      p.splash = w.splash || 0;
      if (weaponId === 'missile') {
        p.homing = w.homing;
        p.maxSpeed = w.maxSpeed;
        p.target = opts.target || null;
      }
    }
    if (this.particles) {
      this.particles.emit(origin.x, origin.y, origin.z, 0, 0, 0, w.color, 1.6, 0.08, 1, 1, 0.9);
    }
  }

  /** Compatibilidad con la API anterior. */
  shoot(origin, direction, type = 'laser') { this.fire(type, origin, direction); }

  enemyShoot(origin, target, damage = 10, speed = 38, spread = 0.12) {
    const dir = _desired.copy(target).sub(origin).normalize();
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread;
    dir.z += (Math.random() - 0.5) * spread;
    this._spawn('enemy', 'enemy', origin, dir, speed, damage, 3.2, 0.5);
  }

  createExplosion(pos, color = 0xff8800, scale = 1) {
    if (this.particles) this.particles.explosion(pos, color, scale);
  }

  /** Busca el objetivo más cercano a la línea de tiro (para misiles). */
  findTarget(origin, dir, ctx, maxDist = 170, minDot = 0.55) {
    let best = null;
    let bestScore = -Infinity;
    const consider = (pos, obj) => {
      _v1.subVectors(pos, origin);
      const d = _v1.length();
      if (d > maxDist || d < 1) return;
      const dot = _v1.dot(dir) / d;
      if (dot < minDot) return;
      const score = dot * 2 - d / maxDist;
      if (score > bestScore) { bestScore = score; best = obj; }
    };
    if (ctx.enemySystem) for (const e of ctx.enemySystem.enemies) if (e.health > 0) consider(e.group.position, e);
    if (ctx.asteroidSystem) for (const a of ctx.asteroidSystem.asteroids) if (a.alive) consider(a.mesh.position, a);
    return best;
  }

  _targetPos(t) {
    if (!t) return null;
    if (t.group) return t.health > 0 ? t.group.position : null;  // OVNI
    if (t.mesh) return t.alive ? t.mesh.position : null;         // asteroide
    return null;
  }

  _explodeSplash(pos, radius, damage, ctx, except) {
    if (ctx.enemySystem) {
      for (const e of ctx.enemySystem.enemies.slice()) {
        if (e === except || e.health <= 0) continue;
        const d = e.group.position.distanceTo(pos);
        if (d < radius + e.radius) ctx.enemySystem.takeDamage(e, damage * (1 - Math.min(0.7, d / (radius + e.radius))), this);
      }
    }
    if (ctx.asteroidSystem) {
      for (const a of ctx.asteroidSystem.asteroids.slice()) {
        if (a === except || !a.alive) continue;
        const d = a.mesh.position.distanceTo(pos);
        if (d < radius + a.radius) ctx.asteroidSystem.damage(a, damage * (1 - Math.min(0.7, d / (radius + a.radius))), this);
      }
    }
  }

  /**
   * ctx = { walle, enemySystem, asteroidSystem, trashSystem }
   */
  update(delta, ctx) {
    const { walle, enemySystem, asteroidSystem, trashSystem } = ctx;
    const particles = this.particles;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= delta;
      _prev.copy(p.mesh.position);

      // Misiles: guiado hacia el objetivo
      if (p.homing) {
        let tp = this._targetPos(p.target);
        if (!tp) {
          p.target = this.findTarget(p.mesh.position, _desired.copy(p.velocity).normalize(), ctx, 140, 0.3);
          tp = this._targetPos(p.target);
        }
        p.speed = Math.min(p.maxSpeed, p.speed + 60 * delta);
        if (tp) {
          _desired.subVectors(tp, p.mesh.position).normalize().multiplyScalar(p.speed);
          p.velocity.lerp(_desired, Math.min(1, p.homing * delta));
        }
        p.velocity.setLength(p.speed);
        p.mesh.quaternion.setFromUnitVectors(_up, _v1.copy(p.velocity).normalize());
        p.trailTimer -= delta;
        if (particles && p.trailTimer <= 0) {
          p.trailTimer = 0.02;
          particles.trail(p.mesh.position, 0xffaa33, 0.9, 0.35, 0.7);
        }
      }

      p.mesh.position.addScaledVector(p.velocity, delta);
      const pos = p.mesh.position;
      let hit = false;

      if (p.owner === 'player') {
        if (enemySystem) {
          for (let k = 0; k < enemySystem.enemies.length; k++) {
            const e = enemySystem.enemies[k];
            if (e.health <= 0) continue;
            if (segmentHitsSphere(_prev, pos, e.group.position, e.radius + p.radius)) {
              enemySystem.takeDamage(e, p.damage, this);
              if (p.splash) this._explodeSplash(pos, p.splash, p.damage * 0.5, ctx, e);
              if (particles) particles.hit(pos, this._defs[p.type].material.color, 7);
              hit = true;
              break;
            }
          }
        }
        if (!hit && asteroidSystem) {
          for (let k = 0; k < asteroidSystem.asteroids.length; k++) {
            const a = asteroidSystem.asteroids[k];
            if (!a.alive) continue;
            if (segmentHitsSphere(_prev, pos, a.mesh.position, a.radius + p.radius)) {
              asteroidSystem.damage(a, p.damage, this);
              if (p.splash) this._explodeSplash(pos, p.splash, p.damage * 0.5, ctx, a);
              if (particles) particles.hit(pos, 0xffcc88, 8);
              hit = true;
              break;
            }
          }
        }
        // El plasma y los misiles rompen la basura en trozos (más piezas que recoger)
        if (!hit && trashSystem && (p.type === 'plasma' || p.type === 'missile')) {
          const list = trashSystem.trashList;
          for (let j = list.length - 1; j >= 0; j--) {
            const t = list[j];
            if (t.collected) continue;
            if (t.mesh.position.distanceToSquared(pos) < 4) {
              const tpos = _v2.copy(t.mesh.position);
              const typeId = t.config.id;
              if (particles) particles.explosion(tpos, t.config.color, 0.45);
              trashSystem.removeTrash(t);
              trashSystem.spawnNear(tpos, 2, [typeId]);
              hit = true;
              break;
            }
          }
        }
      } else if (p.owner === 'enemy' && walle) {
        if (segmentHitsSphere(_prev, pos, walle.position, 1.9)) {
          walle.takeDamage(p.damage);
          if (particles) particles.explosion(pos, 0xff3344, 0.35);
          if (this.onPlayerHit) this.onPlayerHit(p.damage);
          hit = true;
        }
      }

      if (hit || p.life <= 0) {
        if (!hit && p.type === 'missile' && particles) particles.explosion(pos, 0xffaa33, 0.6);
        else if (hit && p.type === 'missile' && particles) particles.explosion(pos, 0xffaa33, 1.1);
        this._kill(i);
      }
    }
  }

  clear() {
    for (let i = this.projectiles.length - 1; i >= 0; i--) this._kill(i);
  }
}
