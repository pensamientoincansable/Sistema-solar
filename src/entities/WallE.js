import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetUrl } from '../utils/assets.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _accel = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _look = new THREE.Vector3();
const _target = new THREE.Vector3();
const _red = new THREE.Color(0xff2200);
const _black = new THREE.Color(0x000000);

/**
 * Distancias de cámara del botón 👁 (móvil) y la tecla V:
 * 1 = tercera persona (distancia original), 0 = primera persona.
 */
export const CAMERA_PRESETS = [1, 0.62, 0.3, 0];
export const CAMERA_PRESET_NAMES = ['Tercera persona', 'Media', 'Cercana', 'Primera persona'];

export class WallE {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.name = 'WALL-E';
    this.mesh = null;
    this.loaded = false;
    this._materials = [];

    // Física / movimiento
    this.position = new THREE.Vector3(0, 0, 80);
    this.velocity = new THREE.Vector3(0, 0, 0);
    // Orden YXZ: guiñada (Y) y luego cabeceo (X) en el eje local, sin alabeo.
    this.rotation = new THREE.Euler(0, 0, 0, 'YXZ');
    this.quaternion = new THREE.Quaternion();
    this.boostMultiplier = 2.2;
    this.drag = 0.92;
    this.collisionRadius = 1.6;
    this.spawnPoint = this.position.clone();
    this.spawnYaw = 0;

    // Mejoras compradas al Taxi-Mercader
    this.upgrades = { engine: 0, armor: 0, cargo: 0, magnet: 0, repair: 0, laser: 0 };
    this.credits = 60;
    this.weapons = ['laser', 'plasma'];
    this.weapon = 'laser';
    this.ammo = { laser: Infinity, plasma: 50, scatter: Infinity, missile: 0 };

    // Stats (applyUpgrades las recalcula)
    this.maxHealth = 100;
    this.health = 100;
    this.trashCount = 0;
    this.materials = {
      metal: 0, polymer: 0, glass: 0, energy: 0, bio: 0,
      water: 0, gas: 0, ice: 0, crystal: 0, concrete: 0
    };
    this.lastCollisionBody = null;
    this.overheating = false;
    this.applyUpgrades();

    // Cámara: zoom continuo entre tercera (1) y primera persona (0)
    this.zoom = 1;
    this.zoomTarget = 1;
    this.cameraOffsetThird = new THREE.Vector3(0, 6, -14);   // distancia original en 3ª persona
    this.cameraOffsetFirst = new THREE.Vector3(0, 0.5, 0.55); // se ajusta a los ojos al cargar el modelo
    this.lookAheadThird = new THREE.Vector3(0, 1, 20);
    this.lookAheadFirst = new THREE.Vector3(0, 0.5, 20);
    this.cameraLerp = 0.08;
    this._lookAt = null;

    // Efectos
    this.thrusterLight = null;
    this.thrusterParticles = null;
    this._flashTime = 0;
    this._flashOn = false;

    this.group.position.copy(this.position);
    this.scene.add(this.group);

    try { this.createFallback(); } catch (e) { console.error('[WALL-E] createFallback error:', e); }
    try { this.createThruster(); } catch (e) { console.error('[WALL-E] createThruster error:', e); }
    try { this.loadModel(); } catch (e) { console.error('[WALL-E] loadModel error:', e); }
  }

  /** Recalcula las estadísticas a partir de las mejoras. */
  applyUpgrades() {
    const u = this.upgrades;
    this.maxSpeed = 35 * (1 + 0.15 * u.engine);
    this.acceleration = 45 * (1 + 0.15 * u.engine);
    const prevMax = this.maxHealth || 100;
    this.maxHealth = 100 + 25 * u.armor;
    if (this.maxHealth > prevMax) this.health = Math.min(this.maxHealth, this.health + (this.maxHealth - prevMax));
    this.trashCapacity = 50 + 25 * u.cargo;
    this.pickupRadius = 4.5 + 1.2 * u.magnet;
    this.magnetRadius = 7 + 6 * u.magnet;
    this.repairRate = 14 * (1 + 0.6 * u.repair);   // % de integridad de refinería por segundo
    this.laserDamageMul = 1 + 0.35 * u.laser;
    this.laserCadenceMul = 1 - 0.1 * u.laser;
  }

  /** Vuelve al estado inicial (nueva misión). */
  resetStats() {
    this.upgrades = { engine: 0, armor: 0, cargo: 0, magnet: 0, repair: 0, laser: 0 };
    this.credits = 60;
    this.weapons = ['laser', 'plasma'];
    this.weapon = 'laser';
    this.ammo = { laser: Infinity, plasma: 50, scatter: Infinity, missile: 0 };
    this.maxHealth = 100;
    this.applyUpgrades();
    this.health = this.maxHealth;
    this.trashCount = 0;
    Object.keys(this.materials).forEach(k => { this.materials[k] = 0; });
  }

  get cameraMode() { return this.zoom < 0.08 ? 'first' : 'third'; }

  createFallback() {
    const geo = new THREE.BoxGeometry(1, 1.1, 1.1);
    const mat = new THREE.MeshStandardMaterial({ color: 0xccbb33, roughness: 0.6, metalness: 0.3 });
    const cube = new THREE.Mesh(geo, mat);
    cube.name = 'walle_fallback';
    this.fallbackMesh = cube;
    this.group.add(cube);
  }

  loadModel() {
    const loader = new GLTFLoader();
    // scene.gltf referencia scene.bin y textures/material_0_* de forma relativa.
    loader.load(
      assetUrl('scene.gltf'),
      (gltf) => {
        try {
          const model = gltf.scene;
          model.scale.set(2.5, 2.5, 2.5);
          // El modelo mira de forma nativa hacia +Z, que es el "adelante" del
          // jugador. Antes se giraba 180° (Math.PI) y WALL·E miraba a la cámara.
          model.rotation.y = 0;
          model.traverse(o => {
            if (o.isMesh) {
              o.castShadow = false;
              o.receiveShadow = false;
              if (o.material) {
                o.material.roughness = 0.7;
                o.material.metalness = 0.2;
                if (o.material.emissive) this._materials.push(o.material);
              }
            }
          });
          // Centrar el modelo en el origen del grupo
          model.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(model);
          const center = box.getCenter(new THREE.Vector3());
          model.position.sub(center);
          box.translate(center.clone().negate());

          // Cámara en primera persona a la altura de los ojos, delante de la cara
          const h = box.max.y - box.min.y;
          const eyeY = box.max.y - h * 0.14;
          this.cameraOffsetFirst.set(0, eyeY, box.max.z * 0.55 + 0.05);
          this.lookAheadFirst.set(0, eyeY, 20);

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
      this.thrusterLight.position.set(0, -0.2, -1.4);
      this.group.add(this.thrusterLight);
    } catch (e) {
      console.error('[WALL-E] thrusterLight error:', e);
    }

    try {
      const count = 60;
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(count * 3);
      const vel = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 0.4;
        pos[i * 3 + 1] = (Math.random() - 0.5) * 0.4 - 0.1;
        pos[i * 3 + 2] = -0.8 - Math.random() * 2;
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
          size: 0.14,
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
    this.snapCamera();
  }

  respawn() {
    this.health = this.maxHealth;
    this.position.copy(this.spawnPoint);
    this.velocity.set(0, 0, 0);
    this.rotation.set(0, this.spawnYaw, 0);
    this.quaternion.setFromEuler(this.rotation);
    this.group.quaternion.copy(this.quaternion);
    this.group.position.copy(this.position);
    this._lookAt = null;
    this.snapCamera();
  }

  update(delta, input, solarSystem) {
    try {
      const boosting = input.boost;

      // Giro: velocidad (joystick/gamepad, rad/s) + delta instantáneo (ratón, rad).
      // Sin inversión: derecha -> gira a la derecha, arriba -> mira arriba.
      this.rotation.y -= input.lookX * delta + input.lookDeltaX;
      this.rotation.x += input.lookY * delta + input.lookDeltaY;
      this.rotation.x = THREE.MathUtils.clamp(this.rotation.x, -1.2, 1.2);

      const forward = _v1.set(0, 0, 1).applyEuler(this.rotation);
      // Mirando hacia +Z con Y arriba, la derecha del jugador es -X (sistema diestro).
      const right = _v2.set(-1, 0, 0).applyEuler(this.rotation);

      _accel.set(0, 0, 0);
      _accel.addScaledVector(forward, input.moveY);
      _accel.addScaledVector(right, input.moveX);
      if (input.up) _accel.y += 1;
      if (input.down) _accel.y -= 1;

      const inputMag = Math.min(1, _accel.length());
      if (inputMag > 0.001) {
        _accel.normalize().multiplyScalar(inputMag * this.acceleration * delta * (boosting ? this.boostMultiplier : 1));
        this.velocity.add(_accel);
      }

      this.velocity.multiplyScalar(Math.pow(this.drag, delta * 60));

      const max = boosting ? this.maxSpeed * this.boostMultiplier : this.maxSpeed;
      const speed = this.velocity.length();
      if (speed > max) this.velocity.multiplyScalar(max / speed);
      if (this.velocity.lengthSq() < 1e-4) this.velocity.set(0, 0, 0);

      this.position.addScaledVector(this.velocity, delta);

      // Colisiones con el sol y los planetas (esferas)
      this.overheating = false;
      const bodies = solarSystem && solarSystem.getBodies ? solarSystem.getBodies() : null;
      if (bodies) {
        for (let i = 0; i < bodies.length; i++) {
          const body = bodies[i];
          const minDist = body.radius + this.collisionRadius;
          const d = this.position.distanceTo(body.position);
          if (d < minDist) {
            const n = _v1.copy(this.position).sub(body.position);
            if (n.lengthSq() < 1e-6) n.set(0, 1, 0); else n.normalize();
            this.position.copy(body.position).addScaledVector(n, minDist + 0.05);
            const vn = this.velocity.dot(n);
            if (vn < 0) {
              this.velocity.addScaledVector(n, -vn * 1.4);
              this.velocity.multiplyScalar(0.6);
              const impact = Math.min(25, Math.abs(vn) * 0.4);
              if (impact > 3) this.takeDamage(impact);
            }
            this.lastCollisionBody = body.id;
          }
          if (body.id === 'sun' && d < body.radius + 8) {
            this.overheating = true;
            this.takeDamage(delta * 12);
          }
        }
      }

      // Límites suaves del sistema solar
      const distToSun = this.position.length();
      if (distToSun > 350) {
        const toCenter = _v1.copy(this.position).normalize().multiplyScalar(-1);
        this.velocity.addScaledVector(toCenter, delta * 10 * (1 + (distToSun - 350) * 0.05));
      }

      this.group.position.copy(this.position);
      this.quaternion.setFromEuler(this.rotation);
      this.group.quaternion.slerp(this.quaternion, Math.min(1, delta * 8));

      // Propulsor
      const speedFactor = Math.min(1, this.velocity.length() / Math.max(1, max));
      if (this.thrusterLight) {
        this.thrusterLight.intensity = 0.5 + speedFactor * 4 + (boosting ? 3 : 0);
      }
      if (this.thrusterParticles) {
        const positions = this.thrusterParticles.geometry.attributes.position.array;
        const vels = this.thrusterParticles.velocities;
        const n = positions.length / 3;
        for (let i = 0; i < n; i++) {
          const i3 = i * 3;
          positions[i3 + 2] += vels[i3 + 2] * delta;
          positions[i3] += vels[i3] * delta;
          positions[i3 + 1] += vels[i3 + 1] * delta;
          if (positions[i3 + 2] < -3.5) {
            positions[i3] = (Math.random() - 0.5) * 0.4;
            positions[i3 + 1] = (Math.random() - 0.5) * 0.4 - 0.1;
            positions[i3 + 2] = -0.7;
          }
        }
        this.thrusterParticles.geometry.attributes.position.needsUpdate = true;
        this.thrusterParticles.points.material.opacity = 0.15 + speedFactor * 0.8;
      }

      this.updateCamera(delta);
      this._updateFlash(delta);

      if (this.health < this.maxHealth && !this.overheating) {
        this.health = Math.min(this.maxHealth, this.health + delta * 0.5);
      }
    } catch (e) {
      console.error('[WALL-E] update error:', e);
    }
  }

  // -------------------------------------------------------------- Cámara

  /** Cambia la distancia objetivo (0 primera persona … 1 tercera persona). */
  setZoomTarget(z) {
    this.zoomTarget = THREE.MathUtils.clamp(z, 0, 1);
    return this.zoomTarget;
  }

  addZoom(dz) { return this.setZoomTarget(this.zoomTarget + dz); }

  /** Pasa al siguiente de los 4 niveles (3ª → media → cercana → 1ª → 3ª). Devuelve el índice. */
  cycleZoomPreset() {
    const P = CAMERA_PRESETS;
    const near = P.findIndex(p => Math.abs(p - this.zoomTarget) <= 0.04);
    let idx;
    if (near >= 0) {
      idx = (near + 1) % P.length;
    } else {
      // Entre dos niveles (p. ej. tras usar la rueda): siguiente más cercano a 1ª persona
      idx = P.findIndex(p => p < this.zoomTarget);
      if (idx < 0) idx = 0;
    }
    this.zoomTarget = P[idx];
    return idx;
  }

  /** Alterna entre tercera y primera persona (tecla C). */
  toggleCameraMode() {
    this.zoomTarget = this.zoomTarget > 0.5 ? 0 : 1;
    return this.zoomTarget > 0.5 ? 'third' : 'first';
  }

  setCameraMode(mode) {
    if (mode === 'first') this.zoomTarget = 0;
    else if (mode === 'third') this.zoomTarget = 1;
    return this.cameraMode;
  }

  /** Coloca la cámara directamente en su posición (sin interpolar). */
  snapCamera() {
    this.zoom = this.zoomTarget;
    _offset.lerpVectors(this.cameraOffsetFirst, this.cameraOffsetThird, this.zoom).applyQuaternion(this.group.quaternion);
    this.camera.position.copy(this.position).add(_offset);
    _look.lerpVectors(this.lookAheadFirst, this.lookAheadThird, this.zoom).applyQuaternion(this.group.quaternion).add(this.position);
    this._lookAt = _look.clone();
    this.camera.lookAt(this._lookAt);
  }

  updateCamera(delta) {
    try {
      // Zoom suavizado (rueda / botón 👁)
      this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.pow(0.0005, delta));
      if (Math.abs(this.zoomTarget - this.zoom) < 0.001) this.zoom = this.zoomTarget;
      const z = this.zoom;

      const k = 1 - Math.pow(1 - this.cameraLerp, delta * 60);
      // En primera persona la cámara va "pegada" a los ojos; alejándose gana inercia
      const stiff = Math.sqrt(z);
      const kPos = THREE.MathUtils.lerp(1, k, stiff);
      const kLook = THREE.MathUtils.lerp(Math.min(1, k * 4), k, stiff);

      _offset.lerpVectors(this.cameraOffsetFirst, this.cameraOffsetThird, z).applyQuaternion(this.group.quaternion);
      _target.copy(this.position).add(_offset);
      this.camera.position.lerp(_target, kPos);

      _look.lerpVectors(this.lookAheadFirst, this.lookAheadThird, z).applyQuaternion(this.group.quaternion).add(this.position);
      if (!this._lookAt) this._lookAt = _look.clone();
      this._lookAt.lerp(_look, kLook);
      this.camera.lookAt(this._lookAt);

      // Muy cerca el modelo taparía la vista: se oculta en primera persona
      const visible = z > 0.08;
      if (this.mesh) this.mesh.visible = visible;
      if (this.fallbackMesh) this.fallbackMesh.visible = visible;
      if (this.thrusterParticles) this.thrusterParticles.points.visible = visible;
    } catch (e) {
      console.error('[WALL-E] updateCamera error:', e);
    }
  }

  // -------------------------------------------------------------- Estado

  takeDamage(amount) {
    if (!(amount > 0)) return this.health <= 0;
    this.health = Math.max(0, this.health - amount);
    if (amount >= 1) this._flashTime = 0.12;
    return this.health <= 0;
  }

  _updateFlash(delta) {
    if (this._flashTime > 0) this._flashTime -= delta;
    const on = this._flashTime > 0;
    if (on === this._flashOn) return;
    this._flashOn = on;
    for (const m of this._materials) m.emissive.copy(on ? _red : _black);
  }

  get cargoFull() { return this.trashCount >= this.trashCapacity; }

  /** Añade carga (basura o agua). Devuelve false si la bodega está llena. */
  addCargo(material, value) {
    if (this.trashCount >= this.trashCapacity) return false;
    this.trashCount++;
    if (this.materials[material] !== undefined) this.materials[material] += value;
    return true;
  }

  collectTrash(trash) {
    return this.addCargo(trash.config.material, trash.config.value);
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
