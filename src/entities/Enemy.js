import * as THREE from 'three';
import { ENEMY_TYPES } from '../config/PlanetsConfig.js';
import { loadModel, normalizeObject } from '../utils/ModelLibrary.js';
import { HealthBar } from '../utils/HealthBar.js';
import { getGlowTexture } from '../utils/textures.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _closest = { planet: null, distance: 0 };

/**
 * EnemySystem - OVNIs (modelo assets/nave_espacial_ufo) que sustituyen a los
 * antiguos enemigos geométricos.
 *
 * Comportamiento:
 *  - patrol:  merodean alrededor de un planeta.
 *  - abduct:  buscan basura cercana, se colocan encima y la absorben con un
 *             rayo tractor (¡te roban la basura! derríbalos para recuperarla).
 *  - attack:  si WALL·E se acerca, lo rodean en círculos disparando.
 *  - flee:    los drones dañados huyen unos segundos.
 */
export class EnemySystem {
  constructor(scene, solarSystem, trashSystem, quality, options = {}) {
    this.scene = scene;
    this.solarSystem = solarSystem;
    this.trashSystem = trashSystem;
    this.quality = quality || { enemyCount: 6 };
    this.options = options || {};
    this.enemies = [];
    this.group = new THREE.Group();
    this.group.name = 'ufos';
    this.scene.add(this.group);
    this.spawnTimer = 0;
    this.graceTime = 12;      // sin ataques nada más empezar
    this.elapsed = 0;
    this.template = null;     // modelo normalizado (diámetro 1)
    this.typeMaterials = {};  // un material teñido por tipo (compartido)
    this.hitMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.onKilled = null;     // (enemy) => {} créditos / notificaciones

    // Rayo tractor compartido (geometría/material)
    this.beamGeometry = new THREE.CylinderGeometry(0.35, 2.4, 1, 18, 1, true);
    this.beamGeometry.translate(0, -0.5, 0); // origen en la parte superior
    this.beamMaterial = new THREE.MeshBasicMaterial({
      color: 0x66ffcc, transparent: true, opacity: 0.28, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });

    // Platillo de respaldo mientras carga (o si falla) el modelo
    this.fallbackGeometry = new THREE.SphereGeometry(0.5, 20, 10);
    this.fallbackGeometry.scale(1, 0.32, 1);
    this.fallbackDome = new THREE.SphereGeometry(0.22, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    this.fallbackDome.translate(0, 0.1, 0);

    try { this.spawnInitial(); } catch (e) { console.error('[Enemy] spawnInitial error:', e); }

    loadModel('ufo').then((gltf) => {
      if (!gltf) return;
      try {
        this.template = normalizeObject(gltf.scene, 1);
        this.template.traverse((o) => {
          if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; }
        });
        for (const e of this.enemies) this._applyVisual(e);
      } catch (err) {
        console.warn('[Enemy] No se pudo preparar el modelo OVNI', err);
      }
    });
  }

  resetGrace() { this.elapsed = 0; }

  _tooCloseToPlayerSpawn(pos) {
    const a = this.options.avoidPosition;
    if (!a) return false;
    return pos.distanceTo(a) < (this.options.avoidRadius || 100);
  }

  _materialFor(cfg, sourceMaterial) {
    if (this.typeMaterials[cfg.id]) return this.typeMaterials[cfg.id];
    let mat;
    if (sourceMaterial) {
      // Se conservan las luces originales del platillo (mapa emisivo); el tipo
      // se distingue por tamaño y por el halo de color bajo la nave.
      mat = sourceMaterial.clone();
      mat.emissiveIntensity = 1.4;
      if (mat.color) mat.color.lerp(new THREE.Color(cfg.color), 0.12);
    } else {
      mat = new THREE.MeshStandardMaterial({ color: 0x9aa4b0, metalness: 0.7, roughness: 0.35, emissive: cfg.color, emissiveIntensity: 0.35 });
    }
    this.typeMaterials[cfg.id] = mat;
    return mat;
  }

  _applyVisual(e) {
    if (e.visual) {
      e.body.remove(e.visual);
      e.visual = null;
    }
    const cfg = e.config;
    let visual;
    if (this.template) {
      visual = this.template.clone(true);
      let srcMat = null;
      visual.traverse((o) => { if (o.isMesh && !srcMat) srcMat = o.material; });
      const mat = this._materialFor(cfg, srcMat);
      visual.traverse((o) => { if (o.isMesh) o.material = mat; });
    } else {
      const mat = this._materialFor({ ...cfg, id: cfg.id + '_fb' }, null);
      visual = new THREE.Group();
      visual.add(new THREE.Mesh(this.fallbackGeometry, mat));
      visual.add(new THREE.Mesh(this.fallbackDome, new THREE.MeshStandardMaterial({ color: cfg.color, emissive: cfg.color, emissiveIntensity: 0.6, transparent: true, opacity: 0.8 })));
    }
    visual.scale.setScalar(cfg.size);
    e.visual = visual;
    e.meshes = [];
    visual.traverse((o) => { if (o.isMesh) e.meshes.push(o); });
    e.baseMaterials = e.meshes.map(m => m.material);
    e.body.add(visual);
  }

  _pickType() {
    const motherships = this.enemies.filter(e => e.config.id === 'mothership').length;
    let r = Math.random();
    for (const t of ENEMY_TYPES) {
      r -= t.weight || 0.3;
      if (r <= 0) {
        if (t.id === 'mothership' && motherships >= 1) return ENEMY_TYPES[0];
        return t;
      }
    }
    return ENEMY_TYPES[0];
  }

  createEnemy(position, typeId = null) {
    try {
      const cfg = typeId ? ENEMY_TYPES.find(t => t.id === typeId) : this._pickType();
      if (!cfg) return null;
      const group = new THREE.Group();
      group.position.copy(position);
      const body = new THREE.Group(); // inclinación / balanceo
      group.add(body);

      // Halo del color del tipo bajo el platillo (rojo dron, naranja pirata, violeta nodriza)
      if (!this.glowMaterials) this.glowMaterials = {};
      if (!this.glowMaterials[cfg.id]) {
        this.glowMaterials[cfg.id] = new THREE.SpriteMaterial({
          map: getGlowTexture(), color: cfg.color, transparent: true, opacity: 0.7,
          blending: THREE.AdditiveBlending, depthWrite: false,
        });
      }
      const glow = new THREE.Sprite(this.glowMaterials[cfg.id]);
      glow.scale.setScalar(cfg.size * 1.5);
      glow.position.y = -cfg.size * 0.08;
      body.add(glow);

      const beam = new THREE.Mesh(this.beamGeometry, this.beamMaterial);
      beam.visible = false;
      beam.position.y = -cfg.size * 0.12;
      group.add(beam);

      const bar = new HealthBar(Math.max(2.5, cfg.size * 0.8), 0.32);
      bar.group.position.y = cfg.size * 0.45 + 0.8;
      bar.setVisible(false);
      group.add(bar.group);

      const enemy = {
        group,
        body,
        beam,
        bar,
        visual: null,
        meshes: [],
        config: cfg,
        radius: cfg.size * 0.5,
        health: cfg.health,
        maxHealth: cfg.health,
        velocity: new THREE.Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4),
        state: 'patrol',
        stateTime: 0,
        targetTrash: null,
        abductTime: 0,
        stolen: 0,
        shootCooldown: 1 + Math.random() * 2,
        strafeDir: Math.random() < 0.5 ? 1 : -1,
        strafeRadius: 18 + Math.random() * 7,
        patrolAngle: Math.random() * Math.PI * 2,
        patrolRadius: 0,
        home: null,
        spin: 0,
        phase: Math.random() * Math.PI * 2,
        hitTimer: 0,
      };
      // Planeta "hogar" para patrullar
      if (this.solarSystem) {
        const info = this.solarSystem.getClosestPlanetInfo(position, _closest);
        enemy.home = info.planet;
        enemy.patrolRadius = info.planet ? info.planet.config.radius + 16 + Math.random() * 30 : 60;
      }
      this._applyVisual(enemy);
      this.group.add(group);
      this.enemies.push(enemy);
      return enemy;
    } catch (e) {
      console.error('[Enemy] createEnemy error:', e);
      return null;
    }
  }

  spawnInitial() {
    const count = this.quality.enemyCount || 6;
    const planets = this.solarSystem ? this.solarSystem.planets : [];
    if (planets.length === 0) {
      for (let i = 0; i < count; i++) {
        this.createEnemy(new THREE.Vector3((Math.random() - 0.5) * 200, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 200));
      }
      return;
    }
    let spawned = 0;
    let attempts = 0;
    while (spawned < count && attempts < count * 12) {
      attempts++;
      const planet = planets[Math.floor(Math.random() * planets.length)];
      const pp = planet.worldPosition;
      const angle = Math.random() * Math.PI * 2;
      const dist = planet.config.radius + 18 + Math.random() * 40;
      const pos = new THREE.Vector3(pp.x + Math.cos(angle) * dist, (Math.random() - 0.5) * 20, pp.z + Math.sin(angle) * dist);
      if (this._tooCloseToPlayerSpawn(pos)) continue;
      if (this.createEnemy(pos)) spawned++;
    }
  }

  _setState(e, state) {
    if (e.state === state) return;
    e.state = state;
    e.stateTime = 0;
    if (state !== 'abduct') {
      e.beam.visible = false;
      e.abductTime = 0;
    }
  }

  _findTrash(e) {
    if (!this.trashSystem) return null;
    let best = null;
    let minD2 = 80 * 80;
    const p = e.group.position;
    for (const t of this.trashSystem.trashList) {
      if (t.collected || t._claimedBy) continue;
      const d2 = t.mesh.position.distanceToSquared(p);
      if (d2 < minD2) { minD2 = d2; best = t; }
    }
    return best;
  }

  update(delta, walle, combatSystem) {
    this.elapsed += delta;
    const canAttack = this.elapsed > this.graceTime && !this.options.peaceful;
    const maxEnemies = Math.round((this.quality.enemyCount || 6) * 1.5);

    // Refuerzos periódicos (lejos del jugador)
    this.spawnTimer += delta;
    if (this.spawnTimer > 14 && this.enemies.length < maxEnemies && this.solarSystem && this.solarSystem.planets.length) {
      this.spawnTimer = 0;
      const planet = this.solarSystem.planets[Math.floor(Math.random() * this.solarSystem.planets.length)];
      const pos = _v1.copy(planet.worldPosition).add(_v2.set((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 60));
      if (!walle || pos.distanceTo(walle.position) > 70) this.createEnemy(pos.clone());
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.health <= 0) continue;
      try { this._updateEnemy(e, delta, walle, combatSystem, canAttack); } catch (err) { /* un OVNI no rompe el resto */ }
    }
  }

  _updateEnemy(e, delta, walle, combatSystem, canAttack) {
    const cfg = e.config;
    const pos = e.group.position;
    e.stateTime += delta;
    e.shootCooldown -= delta;
    const distToPlayer = walle ? pos.distanceTo(walle.position) : Infinity;

    // --- Transiciones ---
    if (e.state !== 'flee') {
      if (canAttack && distToPlayer < 60) {
        if (e.state === 'abduct' && e.targetTrash) { e.targetTrash._claimedBy = null; e.targetTrash = null; }
        this._setState(e, 'attack');
      } else if (e.state === 'attack' && (!canAttack || distToPlayer > 90)) {
        this._setState(e, 'patrol');
      }
    } else if (e.stateTime > 4) {
      this._setState(e, 'patrol');
    }

    if (e.state === 'patrol' && e.stateTime > 1.5) {
      const t = this._findTrash(e);
      if (t) {
        e.targetTrash = t;
        t._claimedBy = e;
        this._setState(e, 'abduct');
      }
    }

    // --- Comportamiento ---
    let speed = cfg.speed;
    if (e.state === 'attack' && walle) {
      // Rodear al jugador a media distancia
      _v1.subVectors(pos, walle.position);
      _v1.y *= 0.4;
      const d = _v1.length() || 1;
      _v1.divideScalar(d);
      _v2.set(-_v1.z, 0, _v1.x).multiplyScalar(e.strafeDir); // tangente
      const radial = (d - e.strafeRadius) * -0.12;
      _desired.copy(_v2).multiplyScalar(0.9).addScaledVector(_v1, radial);
      _desired.y += (walle.position.y + 4 - pos.y) * 0.08;
      _desired.normalize().multiplyScalar(speed * 1.2);
      if (Math.random() < delta * 0.25) e.strafeDir *= -1;
      if (e.shootCooldown <= 0 && distToPlayer < 55 && combatSystem) {
        combatSystem.enemyShoot(_v1.copy(pos).setY(pos.y - cfg.size * 0.1), walle.position, cfg.damage, cfg.id === 'mothership' ? 30 : 38);
        if (cfg.id === 'mothership') {
          combatSystem.enemyShoot(pos, walle.position, cfg.damage * 0.6, 30, 0.35);
          combatSystem.enemyShoot(pos, walle.position, cfg.damage * 0.6, 30, 0.35);
        }
        e.shootCooldown = cfg.fireInterval * (0.8 + Math.random() * 0.4);
      }
    } else if (e.state === 'flee' && walle) {
      _desired.subVectors(pos, walle.position).normalize().multiplyScalar(speed * 1.6);
    } else if (e.state === 'abduct') {
      const t = e.targetTrash;
      if (!t || t.collected) {
        if (t) t._claimedBy = null;
        e.targetTrash = null;
        this._setState(e, 'patrol');
        _desired.set(0, 0, 0);
      } else {
        const hoverY = e.radius * 0.6 + 5;
        _v1.copy(t.mesh.position);
        _v1.y += hoverY;
        _desired.subVectors(_v1, pos);
        const d = _desired.length();
        if (d > 1.2) {
          _desired.multiplyScalar(Math.min(speed, d * 1.5) / d);
          e.beam.visible = false;
          e.abductTime = 0;
        } else {
          // Encima de la basura: rayo tractor
          _desired.multiplyScalar(2);
          e.abductTime += delta;
          e.beam.visible = true;
          const beamLen = Math.max(0.5, pos.y - t.mesh.position.y);
          e.beam.scale.set(1, beamLen, 1);
          this.beamMaterial.opacity = 0.2 + Math.sin(this.elapsed * 14) * 0.08;
          // La basura sube hacia el OVNI
          t.mesh.position.lerp(_v2.copy(pos).setY(pos.y - e.radius * 0.3), Math.min(1, delta * 0.9 * e.abductTime));
          if (e.abductTime > 1.6) {
            if (combatSystem && combatSystem.particles) combatSystem.particles.burst(t.mesh.position, 0x66ffcc, 10, 6, 0.5, 0.5);
            this.trashSystem.removeTrash(t);
            e.stolen++;
            e.targetTrash = null;
            this._setState(e, 'patrol');
          }
        }
      }
    } else {
      // Patrulla alrededor del planeta hogar
      e.patrolAngle += delta * (speed / Math.max(20, e.patrolRadius)) * 0.6;
      const c = e.home ? e.home.worldPosition : _v2.set(0, 0, 0);
      _v1.set(c.x + Math.cos(e.patrolAngle) * e.patrolRadius, Math.sin(e.patrolAngle * 2 + e.phase) * 8, c.z + Math.sin(e.patrolAngle) * e.patrolRadius);
      _desired.subVectors(_v1, pos);
      const d = _desired.length() || 1;
      _desired.multiplyScalar(Math.min(speed * 0.7, d) / d);
    }

    e.velocity.lerp(_desired, Math.min(1, delta * 1.6));
    pos.addScaledVector(e.velocity, delta);

    // No atravesar planetas ni el sol
    if (this.solarSystem) {
      const bodies = this.solarSystem.getBodies();
      for (let b = 0; b < bodies.length; b++) {
        const body = bodies[b];
        const minD = body.radius + e.radius + 2;
        const d2 = pos.distanceToSquared(body.position);
        if (d2 < minD * minD) {
          _v1.subVectors(pos, body.position).normalize();
          pos.copy(body.position).addScaledVector(_v1, minD);
        }
      }
    }

    // --- Animación: giro del disco, flotación y alabeo según la velocidad ---
    e.spin += delta * (e.state === 'attack' ? 3.5 : 1.6);
    if (e.visual) e.visual.rotation.y = e.spin;
    e.body.position.y = Math.sin(this.elapsed * 2 + e.phase) * 0.25;
    e.body.rotation.z = THREE.MathUtils.lerp(e.body.rotation.z, THREE.MathUtils.clamp(-e.velocity.x * 0.03, -0.35, 0.35), delta * 3);
    e.body.rotation.x = THREE.MathUtils.lerp(e.body.rotation.x, THREE.MathUtils.clamp(e.velocity.z * 0.03, -0.35, 0.35), delta * 3);

    if (e.hitTimer > 0) {
      e.hitTimer -= delta;
      if (e.hitTimer <= 0) e.meshes.forEach((m, k) => { m.material = e.baseMaterials[k]; });
    }
    if (e.bar.group.visible) e.bar.set(e.health / e.maxHealth);
  }

  takeDamage(enemy, amount, combatSystem) {
    if (!enemy || enemy.health <= 0) return false;
    enemy.health -= amount;
    enemy.bar.setVisible(true);
    enemy.bar.set(Math.max(0, enemy.health / enemy.maxHealth));
    if (enemy.hitTimer <= 0) enemy.meshes.forEach((m) => { m.material = this.hitMaterial; });
    enemy.hitTimer = 0.07;
    // Al recibir daño se revuelven contra el jugador
    if (enemy.state === 'abduct' || enemy.state === 'patrol') {
      if (enemy.targetTrash) { enemy.targetTrash._claimedBy = null; enemy.targetTrash = null; }
      this._setState(enemy, enemy.config.id === 'drone' && enemy.health < enemy.maxHealth * 0.3 ? 'flee' : 'attack');
    } else if (enemy.config.id === 'drone' && enemy.health < enemy.maxHealth * 0.25 && enemy.state !== 'flee') {
      this._setState(enemy, 'flee');
    }
    if (enemy.health <= 0) {
      this._destroy(enemy, combatSystem);
      return true;
    }
    return false;
  }

  _destroy(enemy, combatSystem) {
    const pos = enemy.group.position.clone();
    if (combatSystem) combatSystem.createExplosion(pos, enemy.config.color, enemy.config.size * 0.35);
    if (enemy.targetTrash) enemy.targetTrash._claimedBy = null;
    this.group.remove(enemy.group);
    const idx = this.enemies.indexOf(enemy);
    if (idx >= 0) this.enemies.splice(idx, 1);
    // Suelta el botín y la basura robada
    if (this.trashSystem) this.trashSystem.spawnNear(pos, (enemy.config.loot || 2) + enemy.stolen, ['satellite', 'panel', 'rocket', 'gas_tank', 'glass', 'plastic']);
    if (this.onKilled) { try { this.onKilled(enemy, pos); } catch (e) { /* noop */ } }
  }

  checkPlayerCollision(walle) {
    if (!walle || this.elapsed <= this.graceTime) return;
    for (const e of this.enemies) {
      const minD = e.radius + 1.6;
      if (e.group.position.distanceToSquared(walle.position) < minD * minD) {
        walle.takeDamage(e.config.damage * 0.1);
        _v1.subVectors(walle.position, e.group.position).normalize();
        walle.velocity.addScaledVector(_v1, 12);
      }
    }
  }

  reset() {
    for (const e of this.enemies) this.group.remove(e.group);
    this.enemies = [];
    this.elapsed = 0;
    this.spawnTimer = 0;
    try { this.spawnInitial(); } catch (e) { console.error('[Enemy] reset error:', e); }
  }
}
