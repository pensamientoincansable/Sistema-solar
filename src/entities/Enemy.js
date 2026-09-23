import * as THREE from 'three';
import { ENEMY_TYPES } from '../config/PlanetsConfig.js';

export class EnemySystem {
  constructor(scene, solarSystem, trashSystem, quality) {
    this.scene = scene;
    this.solarSystem = solarSystem;
    this.trashSystem = trashSystem;
    this.quality = quality;
    this.enemies = [];
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.spawnTimer = 0;
    this.spawnInitial();
  }

  createEnemy(position, typeId=null) {
    const cfg = typeId ? ENEMY_TYPES.find(t=>t.id===typeId) : ENEMY_TYPES[Math.floor(Math.random()*ENEMY_TYPES.length*0.7)];
    // Geometría enemigo - nave agresiva
    let geo;
    if (cfg.id === 'mothership') {
      geo = new THREE.ConeGeometry(cfg.scale*1.2, cfg.scale*2.5, 6);
    } else if (cfg.id === 'pirate') {
      geo = new THREE.TetrahedronGeometry(cfg.scale*1.1,0);
    } else {
      geo = new THREE.OctahedronGeometry(cfg.scale*0.8,0);
    }
    const mat = new THREE.MeshStandardMaterial({
      color: cfg.color,
      emissive: cfg.color,
      emissiveIntensity: 0.4,
      roughness:0.4,
      metalness:0.6
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    mesh.castShadow = true;

    // Luz enemiga
    const light = new THREE.PointLight(cfg.color, 1.5, 10);
    mesh.add(light);

    const enemy = {
      mesh,
      config: cfg,
      health: cfg.health,
      maxHealth: cfg.health,
      velocity: new THREE.Vector3((Math.random()-0.5)*5, (Math.random()-0.5)*2, (Math.random()-0.5)*5),
      targetTrash: null,
      targetPlayer: false,
      shootCooldown: 0,
      state: 'patrol', // patrol, chaseTrash, chasePlayer, flee
      lastSeenPlayer: 0
    };

    this.group.add(mesh);
    this.enemies.push(enemy);
    return enemy;
  }

  spawnInitial() {
    const count = this.quality.enemyCount || 8;
    for (let i=0;i<count;i++) {
      const planet = this.solarSystem.planets[Math.floor(Math.random()*this.solarSystem.planets.length)];
      const pp = planet.getWorldPosition();
      const angle = Math.random()*Math.PI*2;
      const dist = planet.config.radius + 15 + Math.random()*40;
      const pos = new THREE.Vector3(pp.x + Math.cos(angle)*dist, (Math.random()-0.5)*20, pp.z + Math.sin(angle)*dist);
      this.createEnemy(pos);
    }
  }

  update(delta, walle, combatSystem) {
    this.spawnTimer += delta;
    if (this.spawnTimer > 12 && this.enemies.length < (this.quality.enemyCount*1.5)) {
      this.spawnTimer = 0;
      const planet = this.solarSystem.planets[Math.floor(Math.random()*this.solarSystem.planets.length)];
      const pp = planet.getWorldPosition();
      const pos = pp.clone().add(new THREE.Vector3((Math.random()-0.5)*50, (Math.random()-0.5)*20, (Math.random()-0.5)*50));
      this.createEnemy(pos);
    }

    for (let i=this.enemies.length-1;i>=0;i--) {
      const e = this.enemies[i];
      if (e.health <=0) continue;

      e.shootCooldown -= delta;

      const distToPlayer = e.mesh.position.distanceTo(walle.position);
      const canSeePlayer = distToPlayer < 70;

      // IA estados
      if (canSeePlayer && distToPlayer < 45) {
        e.state = 'chasePlayer';
        e.targetPlayer = true;
        e.lastSeenPlayer = 0;
      } else if (e.state === 'chasePlayer') {
        e.lastSeenPlayer += delta;
        if (e.lastSeenPlayer > 6) {
          e.state = 'patrol';
          e.targetPlayer = false;
        }
      } else {
        // Buscar basura
        if (!e.targetTrash || e.targetTrash.collected) {
          let closestTrash = null;
          let minD = Infinity;
          for (const t of this.trashSystem.trashList) {
            if (t.collected) continue;
            const d = t.mesh.position.distanceTo(e.mesh.position);
            if (d < minD && d < 80) { minD = d; closestTrash = t; }
          }
          e.targetTrash = closestTrash;
          e.state = closestTrash ? 'chaseTrash' : 'patrol';
        }
      }

      // Movimiento según estado
      let targetPos = null;
      if (e.state === 'chasePlayer') targetPos = walle.position.clone();
      else if (e.state === 'chaseTrash' && e.targetTrash) targetPos = e.targetTrash.mesh.position.clone();
      else {
        // patrol random wander
        if (Math.random()<0.02) {
          e.velocity.set((Math.random()-0.5)*4, (Math.random()-0.5)*1, (Math.random()-0.5)*4);
        }
        e.mesh.position.addScaledVector(e.velocity, delta);
        e.mesh.rotation.y += delta*0.5;
        e.mesh.rotation.x += delta*0.2;
        continue;
      }

      if (targetPos) {
        const dir = targetPos.sub(e.mesh.position).normalize();
        e.velocity.lerp(dir.multiplyScalar(e.config.speed), delta*1.2);
        e.mesh.position.addScaledVector(e.velocity, delta);
        // Mirar hacia objetivo
        const lookTarget = e.mesh.position.clone().add(e.velocity);
        e.mesh.lookAt(lookTarget);

        // Si cerca de basura, robarla
        if (e.state === 'chaseTrash' && e.targetTrash) {
          if (e.mesh.position.distanceTo(e.targetTrash.mesh.position) < 3) {
            // Robar
            this.trashSystem.group.remove(e.targetTrash.mesh);
            const idx = this.trashSystem.trashList.indexOf(e.targetTrash);
            if (idx>=0) this.trashSystem.trashList.splice(idx,1);
            e.targetTrash = null;
            e.state = 'flee';
            // Crear efecto
            combatSystem.createExplosion(e.mesh.position, 0x00ff00, 0.5);
          }
        }

        // Disparar a jugador
        if (e.state === 'chasePlayer' && distToPlayer < 50 && e.shootCooldown <=0) {
          combatSystem.enemyShoot(e.mesh.position, walle.position, e.config.damage);
          e.shootCooldown = e.config.id === 'mothership' ? 0.8 : e.config.id === 'pirate' ? 1.2 : 1.8;
        }
      }
    }
  }

  takeDamage(enemy, amount, combatSystem) {
    enemy.health -= amount;
    enemy.mesh.material.emissiveIntensity = 1.2;
    setTimeout(()=> { if(enemy.mesh.material) enemy.mesh.material.emissiveIntensity = 0.4; }, 100);
    if (enemy.health <=0) {
      combatSystem.createExplosion(enemy.mesh.position, enemy.config.color, enemy.config.scale);
      this.group.remove(enemy.mesh);
      enemy.mesh.geometry.dispose();
      const idx = this.enemies.indexOf(enemy);
      if (idx>=0) this.enemies.splice(idx,1);
      // Loot basura
      this.trashSystem.spawnNear(enemy.mesh.position, enemy.config.loot ? Math.floor(enemy.config.loot/5) : 2);
      return true;
    }
    return false;
  }

  checkPlayerCollision(walle, combatSystem) {
    for (const e of this.enemies) {
      if (e.mesh.position.distanceTo(walle.position) < (e.config.scale + 2.5)) {
        walle.takeDamage(e.config.damage * 0.1);
        // Empuje
        const pushDir = walle.position.clone().sub(e.mesh.position).normalize();
        walle.velocity.addScaledVector(pushDir, 12);
      }
    }
  }
}
