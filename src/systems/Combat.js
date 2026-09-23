import * as THREE from 'three';

export class CombatSystem {
  constructor(scene) {
    this.scene = scene;
    this.projectiles = [];
    this.explosions = [];
    this.group = new THREE.Group();
    this.scene.add(this.group);
  }

  shoot(origin, direction, type = 'laser', owner = 'player') {
    try {
      let geo, mat, speed, damage, life;
      if (type === 'laser') {
        geo = new THREE.CapsuleGeometry(0.06, 1.2, 4, 8);
        mat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.9 });
        speed = 90;
        damage = 25;
        life = 2.0;
      } else {
        geo = new THREE.SphereGeometry(0.35, 12, 12);
        mat = new THREE.MeshBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.9 });
        speed = 45;
        damage = 60;
        life = 3.0;
      }

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(origin);
      if (type === 'laser') {
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
      }

      try {
        const light = new THREE.PointLight(mat.color, 2, 8);
        mesh.add(light);
      } catch (e) { /* ignore */ }

      const proj = {
        mesh,
        velocity: direction.clone().normalize().multiplyScalar(speed),
        damage,
        type,
        owner,
        life,
        maxLife: life
      };

      this.group.add(mesh);
      this.projectiles.push(proj);

      this.createMuzzle(origin, mat.color);

      return proj;
    } catch (e) {
      console.error('[Combat] shoot error:', e);
      return null;
    }
  }

  enemyShoot(origin, target, damage = 10) {
    try {
      const dir = target.clone().sub(origin).normalize();
      dir.x += (Math.random() - 0.5) * 0.15;
      dir.y += (Math.random() - 0.5) * 0.15;
      dir.z += (Math.random() - 0.5) * 0.15;
      dir.normalize();

      const geo = new THREE.SphereGeometry(0.2, 8, 8);
      const mat = new THREE.MeshBasicMaterial({ color: 0xff3333 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(origin);

      const proj = {
        mesh,
        velocity: dir.multiplyScalar(35),
        damage,
        type: 'enemy',
        owner: 'enemy',
        life: 3,
        maxLife: 3
      };
      this.group.add(mesh);
      this.projectiles.push(proj);
    } catch (e) {
      console.error('[Combat] enemyShoot error:', e);
    }
  }

  createMuzzle(pos, color) {
    try {
      const geo = new THREE.SphereGeometry(0.5, 8, 8);
      const mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      this.group.add(mesh);
      setTimeout(() => {
        try {
          this.group.remove(mesh);
          mesh.geometry.dispose();
        } catch (e) {}
      }, 80);
    } catch (e) {
      console.error('[Combat] createMuzzle error:', e);
    }
  }

  createExplosion(pos, color = 0xff8800, scale = 1) {
    try {
      const count = Math.floor(12 * scale);
      for (let i = 0; i < count; i++) {
        try {
          const geo = new THREE.SphereGeometry(0.15 * scale, 6, 6);
          const mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.9 });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.copy(pos);
          const vel = new THREE.Vector3((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20);
          this.explosions.push({ mesh, velocity: vel, life: 0.6 + Math.random() * 0.5, maxLife: 0.8 });
          this.group.add(mesh);
        } catch (e) { /* skip particle */ }
      }
      try {
        const ringGeo = new THREE.RingGeometry(0.1, 0.2, 16);
        const ringMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.copy(pos);
        ring.lookAt(pos.clone().add(new THREE.Vector3(0, 1, 0)));
        this.explosions.push({ mesh: ring, velocity: new THREE.Vector3(0, 0, 0), life: 0.4, maxLife: 0.4, isRing: true });
        this.group.add(ring);
      } catch (e) { /* skip ring */ }
    } catch (e) {
      console.error('[Combat] createExplosion error:', e);
    }
  }

  update(delta, walle, enemySystem, trashSystem) {
    try {
      // Proyectiles
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        try {
          const p = this.projectiles[i];
          p.life -= delta;
          p.mesh.position.addScaledVector(p.velocity, delta);

          let hit = false;

          if (p.owner === 'player' && enemySystem) {
            for (const enemy of enemySystem.enemies) {
              if (p.mesh.position.distanceTo(enemy.mesh.position) < (enemy.config.scale + 1)) {
                enemySystem.takeDamage(enemy, p.damage, this);
                hit = true;
                break;
              }
            }
            if (!hit && p.type === 'plasma' && trashSystem) {
              for (let j = trashSystem.trashList.length - 1; j >= 0; j--) {
                const t = trashSystem.trashList[j];
                if (p.mesh.position.distanceTo(t.mesh.position) < 2) {
                  try {
                    trashSystem.spawnNear(t.mesh.position, 2);
                    trashSystem.group.remove(t.mesh);
                    trashSystem.trashList.splice(j, 1);
                    this.createExplosion(t.mesh.position, t.config.color, 0.5);
                  } catch (e) {}
                  hit = true;
                  break;
                }
              }
            }
          } else if (p.owner === 'enemy' && walle) {
            if (p.mesh.position.distanceTo(walle.position) < 3) {
              try { walle.takeDamage(p.damage); } catch (e) {}
              this.createExplosion(p.mesh.position, 0xff0000, 0.4);
              hit = true;
            }
          }

          if (hit || p.life <= 0) {
            try {
              this.group.remove(p.mesh);
              p.mesh.geometry.dispose();
            } catch (e) {}
            this.projectiles.splice(i, 1);
          }
        } catch (e) { /* skip projectile */ }
      }

      // Explosiones
      for (let i = this.explosions.length - 1; i >= 0; i--) {
        try {
          const ex = this.explosions[i];
          ex.life -= delta;
          ex.mesh.position.addScaledVector(ex.velocity, delta);
          ex.velocity.multiplyScalar(0.98);
          if (ex.isRing) {
            ex.mesh.scale.multiplyScalar(1 + delta * 8);
            ex.mesh.material.opacity = ex.life / ex.maxLife;
          } else {
            ex.mesh.material.opacity = ex.life / ex.maxLife;
            ex.mesh.scale.multiplyScalar(1 + delta * 2);
          }
          if (ex.life <= 0) {
            try {
              this.group.remove(ex.mesh);
              ex.mesh.geometry.dispose();
            } catch (e) {}
            this.explosions.splice(i, 1);
          }
        } catch (e) { /* skip explosion */ }
      }
    } catch (e) {
      console.error('[Combat] update error:', e);
    }
  }
}
