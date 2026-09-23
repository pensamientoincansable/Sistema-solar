import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetUrl } from '../utils/assets.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class WallE {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.name = 'WALL-E';
    this.mesh = null;
    this.mixer = null;
    this.loaded = false;

    // Física / movimiento
    this.position = new THREE.Vector3(0, 0, 80);
    this.velocity = new THREE.Vector3(0, 0, 0);
    // Orden YXZ: primero guiñada (Y) y luego cabeceo (X) en el eje local.
    // Con el orden por defecto (XYZ) cabecear mirando a ±X producía alabeo.
    this.rotation = new THREE.Euler(0, 0, 0, 'YXZ');
    this.quaternion = new THREE.Quaternion();
    this.speed = 0;
    this.maxSpeed = 35;
    this.boostMultiplier = 2.2;
    this.acceleration = 45;
    this.drag = 0.92;
    this.collisionRadius = 1.6;
    this.spawnPoint = this.position.clone();
    this.spawnYaw = 0;

    // Stats
    this.health = 100;
    this.maxHealth = 100;
    this.trashCapacity = 50;
    this.trashCount = 0;
    this.materials = {
      metal: 0, polymer: 0, glass: 0, energy: 0, bio: 0,
      water: 0, gas: 0, ice: 0, crystal: 0, concrete: 0
    };
    this.weapon = 'laser';
    this.ammo = { laser: Infinity, plasma: 50 };
    this.lastCollisionBody = null;
    this.overheating = false;

    // Cámara
    this.cameraMode = 'third';
    this.cameraOffsetThird = new THREE.Vector3(0, 6, -14);
    this.cameraOffsetFirst = new THREE.Vector3(0, 1.2, 0.6);
    this.cameraLookAtOffset = new THREE.Vector3(0, 1, 20);
    this.cameraLerp = 0.08;

    // Efectos
    this.thrusterLight = null;
    this.thrusterParticles = null;

    this.group.position.copy(this.position);
    this.scene.add(this.group);

    // Crear fallback y thruster de forma robusta. Si la carga del modelo falla,
    // el cubo fallback sigue permitiendo jugar.
    try { this.createFallback(); } catch (e) { console.error('[WALL-E] createFallback error:', e); }
    try { this.createThruster(); } catch (e) { console.error('[WALL-E] createThruster error:', e); }
    try { this.loadModel(); } catch (e) { console.error('[WALL-E] loadModel error:', e); }
  }

  createFallback() {
    const geo = new THREE.BoxGeometry(2, 2.2, 2.5);
    const mat = new THREE.MeshStandardMaterial({ color: 0xccbb33, roughness: 0.6, metalness: 0.3 });
    const cube = new THREE.Mesh(geo, mat);
    cube.name = 'walle_fallback';
    this.fallbackMesh = cube;
    this.group.add(cube);
  }

  loadModel() {
    const loader = new GLTFLoader();
    // scene.gltf referencia scene.bin y textures/material_0_* de forma relativa,
    // por lo que el GLTFLoader los resuelve respecto a la URL del .gltf.
    loader.load(
      assetUrl('scene.gltf'),
      (gltf) => {
        try {
          const model = gltf.scene;
          model.scale.set(2.5, 2.5, 2.5);
          model.rotation.y = Math.PI;
          model.traverse(o => {
            if (o.isMesh) {
              o.castShadow = true;
              o.receiveShadow = true;
              if (o.material) {
                o.material.roughness = 0.7;
                o.material.metalness = 0.2;
              }
            }
          });
          // Centrar el modelo en el origen del grupo (el GLTF puede venir desplazado)
          const box = new THREE.Box3().setFromObject(model);
          const center = box.getCenter(new THREE.Vector3());
          model.position.sub(center);

          if (this.fallbackMesh) {
            this.group.remove(this.fallbackMesh);
            this.fallbackMesh.geometry.dispose();
            this.fallbackMesh.material.dispose();
            this.fallbackMesh = null;
          }
          this.mesh = model;
          this.group.add(model);
          this.loaded = true;
          console.log('[WALL-E] Modelo cargado');
        } catch (err) {
          console.warn('[WALL-E] Error post-carga, se mantiene fallback', err);
        }
      },
      undefined,
      (err) => {
        console.warn('[WALL-E] Error cargando modelo, usando fallback', err);
        this.loaded = false;
      }
    );
  }

  createThruster() {
    try {
      this.thrusterLight = new THREE.PointLight(0x00f0ff, 2, 15);
      this.thrusterLight.position.set(0, -0.5, -1.5);
      this.group.add(this.thrusterLight);
    } catch (e) {
      console.error('[WALL-E] thrusterLight error:', e);
    }

    try {
      const count = 80;
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(count * 3);
      const vel = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 0.5;
        pos[i * 3 + 1] = (Math.random() - 0.5) * 0.5;
        pos[i * 3 + 2] = -1.5 - Math.random() * 2;
        vel[i * 3] = (Math.random() - 0.5) * 0.5;
        vel[i * 3 + 1] = (Math.random() - 0.5) * 0.5;
        vel[i * 3 + 2] = -5 - Math.random() * 10;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.thrusterParticles = {
        geometry: geo,
        velocities: vel,
        points: new THREE.Points(geo, new THREE.PointsMaterial({
          color: 0x00f0ff,
          size: 0.15,
          transparent: true,
          opacity: 0.8,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        }))
      };
      this.thrusterParticles.points.frustumCulled = false;
      this.group.add(this.thrusterParticles.points);
    } catch (e) {
      console.error('[WALL-E] thrusterParticles error:', e);
    }
  }

  /** Coloca a WALL·E en un punto mirando hacia `lookAt` (opcional) y lo define como spawn. */
  placeAt(position, lookAt = null) {
    this.position.copy(position);
    this.velocity.set(0, 0, 0);
    if (lookAt) {
      _v1.copy(lookAt).sub(position);
      this.rotation.set(0, Math.atan2(_v1.x, _v1.z), 0);
    }
    this.quaternion.setFromEuler(this.rotation);
    this.group.quaternion.copy(this.quaternion);
    this.group.position.copy(this.position);
    this.spawnPoint.copy(this.position);
    this.spawnYaw = this.rotation.y;
    this._lookAt = null;
  }

  respawn() {
    this.health = this.maxHealth;
    this.position.copy(this.spawnPoint);
    this.velocity.set(0, 0, 0);
    this.rotation.set(0, this.spawnYaw, 0);
    this.quaternion.setFromEuler(this.rotation);
    this.group.quaternion.copy(this.quaternion);
    this.group.position.copy(this.position);
  }

  update(delta, input, solarSystem) {
    try {
      const boosting = input.boost;

      // Giro: velocidad (joystick/gamepad) + delta instantáneo (ratón)
      this.rotation.y -= input.lookX * delta + input.lookDeltaX;
      this.rotation.x += input.lookY * delta + input.lookDeltaY;
      this.rotation.x = THREE.MathUtils.clamp(this.rotation.x, -1.2, 1.2);

      const forward = _v1.set(0, 0, 1).applyEuler(this.rotation);
      // Mirando hacia +Z con Y arriba, la derecha del jugador es -X (sistema diestro).
      const right = _v2.set(-1, 0, 0).applyEuler(this.rotation);

      const targetAccel = new THREE.Vector3();
      targetAccel.addScaledVector(forward, input.moveY);
      targetAccel.addScaledVector(right, input.moveX);
      if (input.up) targetAccel.y += 1;
      if (input.down) targetAccel.y -= 1;

      if (targetAccel.lengthSq() > 0) {
        targetAccel.normalize().multiplyScalar(this.acceleration * delta * (boosting ? this.boostMultiplier : 1));
        this.velocity.add(targetAccel);
      }

      this.velocity.multiplyScalar(Math.pow(this.drag, delta * 60));

      const max = boosting ? this.maxSpeed * this.boostMultiplier : this.maxSpeed;
      if (this.velocity.length() > max) {
        this.velocity.normalize().multiplyScalar(max);
      }
      if (this.velocity.lengthSq() < 1e-4) this.velocity.set(0, 0, 0);

      this.position.addScaledVector(this.velocity, delta);

      // Colisiones con el sol y los planetas (esferas)
      this.overheating = false;
      if (solarSystem && solarSystem.getBodies) {
        for (const body of solarSystem.getBodies()) {
          const minDist = body.radius + this.collisionRadius;
          const d = this.position.distanceTo(body.position);
          if (d < minDist) {
            const n = _v1.copy(this.position).sub(body.position);
            if (n.lengthSq() < 1e-6) n.set(0, 1, 0); else n.normalize();
            this.position.copy(body.position).addScaledVector(n, minDist + 0.05);
            const vn = this.velocity.dot(n);
            if (vn < 0) {
              // Rebote amortiguado
              this.velocity.addScaledVector(n, -vn * 1.4);
              this.velocity.multiplyScalar(0.6);
              const impact = Math.min(25, Math.abs(vn) * 0.4);
              if (impact > 3) this.takeDamage(impact);
            }
            this.lastCollisionBody = body.id;
          }
          if (body.id === 'sun' && d < body.radius + 8) {
            // Calor extremo cerca del sol
            this.overheating = true;
            this.takeDamage(delta * 12);
          }
        }
      }

      this.group.position.copy(this.position);

      this.quaternion.setFromEuler(this.rotation);
      this.group.quaternion.slerp(this.quaternion, Math.min(1, delta * 6));

      // Thruster intensidad
      const speedFactor = this.velocity.length() / max;
      if (this.thrusterLight) {
        this.thrusterLight.intensity = 0.5 + speedFactor * 4 + (boosting ? 3 : 0);
        this.thrusterLight.color.setHSL(0.52 + speedFactor * 0.05, 1, 0.5);
      }
      if (this.thrusterParticles) {
        const positions = this.thrusterParticles.geometry.attributes.position.array;
        const vels = this.thrusterParticles.velocities;
        for (let i = 0; i < positions.length / 3; i++) {
          positions[i * 3 + 2] += vels[i * 3 + 2] * delta;
          positions[i * 3] += vels[i * 3] * delta;
          positions[i * 3 + 1] += vels[i * 3 + 1] * delta;
          if (positions[i * 3 + 2] < -4) {
            positions[i * 3] = (Math.random() - 0.5) * 0.5;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 0.5;
            positions[i * 3 + 2] = -1.2;
          }
        }
        this.thrusterParticles.geometry.attributes.position.needsUpdate = true;
        this.thrusterParticles.points.material.opacity = 0.2 + speedFactor * 0.8;
      }

      this.updateCamera(delta);

      // Límites suaves sistema solar
      const distToSun = this.position.length();
      if (distToSun > 350) {
        const toCenter = _v1.copy(this.position).normalize().multiplyScalar(-1);
        this.velocity.addScaledVector(toCenter, delta * 10);
      }

      if (this.health < this.maxHealth && !this.overheating) {
        this.health = Math.min(this.maxHealth, this.health + delta * 0.5);
      }
    } catch (e) {
      console.error('[WALL-E] update error:', e);
    }
  }

  updateCamera(delta) {
    try {
      // Interpolación independiente del framerate
      const k = 1 - Math.pow(1 - this.cameraLerp, delta * 60);
      if (this.cameraMode === 'third') {
        const offset = this.cameraOffsetThird.clone().applyQuaternion(this.group.quaternion);
        const targetPos = this.position.clone().add(offset);
        this.camera.position.lerp(targetPos, k);

        const lookOffset = this.cameraLookAtOffset.clone().applyQuaternion(this.group.quaternion);
        const lookTarget = this.position.clone().add(lookOffset);
        if (!this._lookAt) this._lookAt = lookTarget.clone();
        this._lookAt.lerp(lookTarget, k);
        this.camera.lookAt(this._lookAt);
      } else if (this.cameraMode === 'first') {
        const offset = this.cameraOffsetFirst.clone().applyQuaternion(this.group.quaternion);
        const targetPos = this.position.clone().add(offset);
        this.camera.position.lerp(targetPos, Math.min(1, k * 2.5));
        const look = this.position.clone().add(new THREE.Vector3(0, 0, 20).applyQuaternion(this.group.quaternion));
        if (!this._lookAt) this._lookAt = look.clone();
        this._lookAt.lerp(look, Math.min(1, k * 2));
        this.camera.lookAt(this._lookAt);
      }
      // En primera persona el modelo no debe tapar la cámara
      if (this.mesh) this.mesh.visible = this.cameraMode !== 'first';
      if (this.fallbackMesh) this.fallbackMesh.visible = this.cameraMode !== 'first';
    } catch (e) {
      console.error('[WALL-E] updateCamera error:', e);
    }
  }

  toggleCameraMode() {
    this.cameraMode = this.cameraMode === 'third' ? 'first' : 'third';
    return this.cameraMode;
  }

  setCameraMode(mode) {
    if (mode === 'first' || mode === 'third') this.cameraMode = mode;
    return this.cameraMode;
  }

  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
    if (amount >= 1 && this.mesh && !this._flashTimeout) {
      try {
        this.mesh.traverse(o => {
          if (o.isMesh && o.material && o.material.emissive) {
            o.material.emissive.set(0xff0000);
          }
        });
        this._flashTimeout = setTimeout(() => {
          this._flashTimeout = null;
          try {
            this.mesh.traverse(o => {
              if (o.isMesh && o.material && o.material.emissive) o.material.emissive.set(0x000000);
            });
          } catch (e) { /* noop */ }
        }, 120);
      } catch (e) { /* ignore */ }
    }
    return this.health <= 0;
  }

  collectTrash(trash) {
    if (this.trashCount >= this.trashCapacity) return false;
    this.trashCount++;
    const mat = trash.config.material;
    if (this.materials[mat] !== undefined) {
      this.materials[mat] += trash.config.value;
    }
    return true;
  }

  canDeposit() { return this.trashCount > 0; }

  deposit() {
    const count = this.trashCount;
    this.trashCount = 0;
    const copy = { ...this.materials };
    Object.keys(this.materials).forEach(k => { this.materials[k] = 0; });
    return { materials: copy, count };
  }
}
