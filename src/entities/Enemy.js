import * as THREE from 'three';
import { ENEMY_TYPES } from '../config/PlanetsConfig.js';

export class EnemySystem {
  constructor(scene, solarSystem, trashSystem, quality, options = {}) {
    this.scene = scene;
    this.solarSystem = solarSystem;
    this.trashSystem = trashSystem;
    this.quality = quality || { enemyCount: 8 };
    this.options = options || {};
    this.enemies = [];
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.spawnTimer = 0;
    // Periodo de gracia: los enemigos no atacan al jugador nada más empezar
    this.graceTime = 12;
    this.elapsed = 0;
    try { this.spawnInitial(); } catch (e) { console.error('[Enemy] spawnInitial error:', e); }
  }

  resetGrace() { this.elapsed = 0; }

  /** True si la posición está demasiado cerca del punto de aparición del jugador. */
  _tooCloseToPlayerSpawn(pos) {
    const a = this.options.avoidPosition;
    if (!a) return false;
    return pos.distanceTo(a) < (this.options.avoidRadius || 100);
  }

  createEnemy(position, typeId = null) {
    try {
      const cfg = typeId ? ENEMY_TYPES.find(t => t.id === typeId) : ENEMY_TYPES[Math.floor(Math.random() * ENEMY_TYPES.length * 0.7)];
      if (!cfg) return null;
      let geo;
      if (cfg.id === 'mothership') {
        geo = new THREE.ConeGeometry(cfg.scale * 1.2, cfg.scale * 2.5, 6);
      } else if (cfg.id === 'pirate') {
        geo = new THREE.TetrahedronGeometry(cfg.scale * 1.1, 0);
      } else {
        geo = new THREE.OctahedronGeometry(cfg.scale * 0.8, 0);
      }
      const mat = new THREE.MeshStandardMaterial({
        color: cfg.color,
        emissive: cfg.color,
        emissiveIntensity: 0.4,
        roughness: 0.4,
        metalness: 0.6
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);
      mesh.castShadow = true;

      try {
        const light = new THREE.PointLight(cfg.color, 1.5, 10);
        mesh.add(light);
      } catch (e) { /* ignore */ }

      const enemy = {
        mesh,
        config: cfg,
        health: cfg.health,
        maxHealth: cfg.health,
        velocity: new THREE.Vector3((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 5),
        targetTrash: null,
        targetPlayer: false,
        shootCooldown: 0,
        state: 'patrol',
        lastSeenPlayer: 0
      };

      this.group.add(mesh);
      this.enemies.push(enemy);
      return enemy;
    } catch (e) {
      console.error('[Enemy] createEnemy error:', e);
      return null;
    }
  }

  spawnInitial() {
    const count = this.quality.enemyCount || 8;
    const planets = this.solarSystem ? this.solarSystem.planets : [];
    if (planets.length === 0) {
      for (let i = 0; i < count; i++) {
        const pos = new THREE.Vector3(
          (Math.random() - 0.5) * 200,
          (Math.random() - 0.5) * 50,
          (Math.random() - 0.5) * 200
        );
        this.createEnemy(pos);
      }
      return;
    }
    let spawned = 0;
    let attempts = 0;
    while (spawned < count && attempts < count * 10) {
      attempts++;
      try {
        const planet = planets[Math.floor(Math.random() * planets.length)];
        const pp = planet.getWorldPosition();
        const angle = Math.random() * Math.PI * 2;
        const dist = planet.config.radius + 15 + Math.random() * 40;
        const pos = new THREE.Vector3(pp.x + Math.cos(angle) * dist, (Math.random() - 0.5) * 20, pp.z + Math.sin(angle) * dist);
        if (this._tooCloseToPlayerSpawn(pos)) continue;
        if (this.createEnemy(pos)) spawned++;
      } catch (e) { /* skip */ }
    }
  }

  update(delta, walle, combatSystem) {
    try {
      this.elapsed += delta;
      const canAttack = this.elapsed > this.graceTime;
      this.spawnTimer += delta;
      if (this.spawnTimer > 12 && this.enemies.length < ((this.quality.enemyCount || 8) * 1.5)) {
        this.spawnTimer = 0;
        if (this.solarSystem && this.solarSystem.planets.length) {
          try {
            const planet = this.solarSystem.planets[Math.floor(Math.random() * this.solarSystem.planets.length)];
            const pp = planet.getWorldPosition();
            const pos = pp.clone().add(new THREE.Vector3((Math.random() - 0.5) * 50, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 50));
            // No aparecer encima del jugador
            if (!walle || pos.distanceTo(walle.position) > 60) this.createEnemy(pos);
          } catch (e) { /* skip */ }
        }
      }

      for (let i = this.enemies.length - 1; i >= 0; i--) {
        try {
          const e = this.enemies[i];
          if (e.health <= 0) continue;

          e.shootCooldown -= delta;

          const distToPlayer = walle ? e.mesh.position.distanceTo(walle.position) : Infinity;
          const canSeePlayer = canAttack && distToPlayer < 70;

          if (canSeePlayer && distToPlayer < 45) {
            e.state = 'chasePlayer';
            e.targetPlayer = true;
            e.lastSeenPlayer = 0;
          } else if (e.state === 'chasePlayer' && !canAttack) {
            e.state = 'patrol';
            e.targetPlayer = false;
          } else if (e.state === 'chasePlayer') {
            e.lastSeenPlayer += delta;
            if (e.lastSeenPlayer > 6) {
              e.state = 'patrol';
              e.targetPlayer = false;
            }
          } else {
            if (!e.targetTrash || e.targetTrash.collected) {
              let closestTrash = null;
              let minD = Infinity;
              if (this.trashSystem) {
                for (const t of this.trashSystem.trashList) {
                  if (t.collected) continue;
                  const d = t.mesh.position.distanceTo(e.mesh.position);
                  if (d < minD && d < 80) { minD = d; closestTrash = t; }
                }
              }
              e.targetTrash = closestTrash;
              e.state = closestTrash ? 'chaseTrash' : 'patrol';
            }
          }

          let targetPos = null;
          if (e.state === 'chasePlayer' && walle) targetPos = walle.position.clone();
          else if (e.state === 'chaseTrash' && e.targetTrash) targetPos = e.targetTrash.mesh.position.clone();
          else {
            if (Math.random() < 0.02) {
              e.velocity.set((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 1, (Math.random() - 0.5) * 4);
            }
            e.mesh.position.addScaledVector(e.velocity, delta);
            e.mesh.rotation.y += delta * 0.5;
            e.mesh.rotation.x += delta * 0.2;
            continue;
          }

          if (targetPos) {
            const dir = targetPos.sub(e.mesh.position).normalize();
            e.velocity.lerp(dir.multiplyScalar(e.config.speed), delta * 1.2);
            e.mesh.position.addScaledVector(e.velocity, delta);
            const lookTarget = e.mesh.position.clone().add(e.velocity);
            e.mesh.lookAt(lookTarget);

            if (e.state === 'chaseTrash' && e.targetTrash && this.trashSystem) {
              if (e.mesh.position.distanceTo(e.targetTrash.mesh.position) < 3) {
                try {
                  this.trashSystem.group.remove(e.targetTrash.mesh);
                  const idx = this.trashSystem.trashList.indexOf(e.targetTrash);
                  if (idx >= 0) this.trashSystem.trashList.splice(idx, 1);
                  if (combatSystem) combatSystem.createExplosion(e.mesh.position, 0x00ff00, 0.5);
                } catch (err) { /* skip */ }
                e.targetTrash = null;
                e.state = 'flee';
              }
            }

            if (e.state === 'chasePlayer' && distToPlayer < 50 && e.shootCooldown <= 0 && combatSystem && walle) {
              combatSystem.enemyShoot(e.mesh.position, walle.position, e.config.damage);
              e.shootCooldown = e.config.id === 'mothership' ? 0.8 : e.config.id === 'pirate' ? 1.2 : 1.8;
            }
          }
        } catch (e) { /* skip enemy */ }
      }
    } catch (err) {
      console.error('[Enemy] update error:', err);
    }
  }

  takeDamage(enemy, amount, combatSystem) {
    try {
      enemy.health -= amount;
      if (enemy.mesh.material) enemy.mesh.material.emissiveIntensity = 1.2;
      setTimeout(() => {
        try { if (enemy.mesh.material) enemy.mesh.material.emissiveIntensity = 0.4; } catch (e) {}
      }, 100);
      if (enemy.health <= 0) {
        if (combatSystem) combatSystem.createExplosion(enemy.mesh.position, enemy.config.color, enemy.config.scale);
        this.group.remove(enemy.mesh);
        enemy.mesh.geometry.dispose();
        const idx = this.enemies.indexOf(enemy);
        if (idx >= 0) this.enemies.splice(idx, 1);
        if (this.trashSystem) this.trashSystem.spawnNear(enemy.mesh.position, enemy.config.loot ? Math.floor(enemy.config.loot / 5) : 2);
        return true;
      }
    } catch (e) {
      console.error('[Enemy] takeDamage error:', e);
    }
    return false;
  }

  checkPlayerCollision(walle, combatSystem) {
    if (!walle || this.elapsed <= this.graceTime) return;
    for (const e of this.enemies) {
      try {
        if (e.mesh.position.distanceTo(walle.position) < (e.config.scale + 2.5)) {
          walle.takeDamage(e.config.damage * 0.1);
          const pushDir = walle.position.clone().sub(e.mesh.position).normalize();
          walle.velocity.addScaledVector(pushDir, 12);
        }
      } catch (err) { /* skip */ }
    }
  }
}
