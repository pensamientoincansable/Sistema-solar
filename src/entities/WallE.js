import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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
    this.velocity = new THREE.Vector3(0,0,0);
    this.rotation = new THREE.Euler(0,0,0);
    this.quaternion = new THREE.Quaternion();
    this.speed = 0;
    this.maxSpeed = 35;
    this.boostMultiplier = 2.2;
    this.acceleration = 45;
    this.drag = 0.92;

    // Stats
    this.health = 100;
    this.maxHealth = 100;
    this.trashCapacity = 50;
    this.trashCount = 0;
    this.materials = {
      metal:0, polymer:0, glass:0, energy:0, bio:0, water:0, gas:0, ice:0, crystal:0, concrete:0
    };
    this.weapon = 'laser'; // laser | plasma
    this.ammo = { laser: Infinity, plasma: 50 };

    // Cámara
    this.cameraMode = 'third'; // third | first | orbit
    this.cameraOffsetThird = new THREE.Vector3(0, 6, -14);
    this.cameraOffsetFirst = new THREE.Vector3(0, 1.2, 0.6);
    this.cameraLookAtOffset = new THREE.Vector3(0, 1, 20);
    this.cameraLerp = 0.08;

    // Efectos
    this.thrusterLight = null;
    this.thrusterParticles = null;

    this.scene.add(this.group);
    this.loadModel();
    this.createFallback();
    this.createThruster();
  }

  createFallback() {
    // Fallback cube hasta que cargue modelo real - para no bloquear gameplay
    const geo = new THREE.BoxGeometry(2, 2.2, 2.5);
    const mat = new THREE.MeshStandardMaterial({ color: 0xccbb33, roughness:0.6, metalness:0.3 });
    const cube = new THREE.Mesh(geo, mat);
    cube.name = 'walle_fallback';
    this.fallbackMesh = cube;
    this.group.add(cube);
  }

  loadModel() {
    const loader = new GLTFLoader();
    loader.load('/scene.gltf',
      (gltf) => {
        if (this.fallbackMesh) {
          this.group.remove(this.fallbackMesh);
          this.fallbackMesh.geometry.dispose();
        }
        const model = gltf.scene;
        model.scale.set(2.5,2.5,2.5);
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
        this.mesh = model;
        this.group.add(model);
        this.loaded = true;
        console.log('[WALL-E] Modelo cargado');
      },
      (xhr) => {
        // progress
      },
      (err) => {
        console.warn('[WALL-E] Error cargando modelo, usando fallback', err);
      }
    );
  }

  createThruster() {
    this.thrusterLight = new THREE.PointLight(0x00f0ff, 2, 15);
    this.thrusterLight.position.set(0,-0.5,-1.5);
    this.group.add(this.thrusterLight);

    // Partículas simples con Points
    const count = 80;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count*3);
    const vel = new Float32Array(count*3);
    for (let i=0;i<count;i++) {
      pos[i*3]= (Math.random()-0.5)*0.5;
      pos[i*3+1]= (Math.random()-0.5)*0.5;
      pos[i*3+2]= -1.5 - Math.random()*2;
      vel[i*3]= (Math.random()-0.5)*0.5;
      vel[i*3+1]= (Math.random()-0.5)*0.5;
      vel[i*3+2]= -5 - Math.random()*10;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
    this.thrusterParticles = {
      geometry: geo,
      velocities: vel,
      points: new THREE.Points(geo, new THREE.PointsMaterial({
        color: 0x00f0ff,
        size:0.15,
        transparent:true,
        opacity:0.8,
        blending: THREE.AdditiveBlending
      }))
    };
    this.group.add(this.thrusterParticles.points);
  }

  update(delta, input, solarSystem) {
    // Input movimiento
    const moveX = input.moveX;
    const moveY = input.moveY;
    const lookX = input.lookX;
    const lookY = input.lookY;
    const boosting = input.boost;

    // Rotación basada en look
    this.rotation.y -= lookX * delta * 1.5;
    this.rotation.x -= lookY * delta * 1.2;
    this.rotation.x = THREE.MathUtils.clamp(this.rotation.x, -0.8, 0.8);

    // Dirección forward basada en rotación
    const forward = new THREE.Vector3(0,0,1).applyEuler(this.rotation);
    const right = new THREE.Vector3(1,0,0).applyEuler(this.rotation);
    const up = new THREE.Vector3(0,1,0).applyEuler(this.rotation);

    // Aceleración
    const targetAccel = new THREE.Vector3();
    targetAccel.addScaledVector(forward, moveY);
    targetAccel.addScaledVector(right, moveX);
    // Up/down con Q/E o mouse wheel? Usamos R/F keys
    if (input.keys['keyq']) targetAccel.addScaledVector(up, 1);
    if (input.keys['keye']) targetAccel.addScaledVector(up, -1);

    if (targetAccel.lengthSq() > 0) {
      targetAccel.normalize().multiplyScalar(this.acceleration * delta * (boosting ? this.boostMultiplier : 1));
      this.velocity.add(targetAccel);
    }

    // Drag
    this.velocity.multiplyScalar(Math.pow(this.drag, delta*60));

    // Limitar velocidad
    const max = boosting ? this.maxSpeed * this.boostMultiplier : this.maxSpeed;
    if (this.velocity.length() > max) {
      this.velocity.normalize().multiplyScalar(max);
    }

    // Actualizar posición
    this.position.addScaledVector(this.velocity, delta);
    this.group.position.copy(this.position);

    // Rotación suave del modelo hacia velocidad
    this.quaternion.setFromEuler(this.rotation);
    this.group.quaternion.slerp(this.quaternion, delta*3);

    // Thruster efecto intensidad
    const speedFactor = this.velocity.length() / max;
    if (this.thrusterLight) {
      this.thrusterLight.intensity = 0.5 + speedFactor * 4 + (boosting ? 3 : 0);
      this.thrusterLight.color.setHSL(0.52 + speedFactor*0.05, 1, 0.5);
    }
    if (this.thrusterParticles) {
      const positions = this.thrusterParticles.geometry.attributes.position.array;
      const vels = this.thrusterParticles.velocities;
      for (let i=0;i<positions.length/3;i++) {
        positions[i*3+2] += vels[i*3+2]*delta;
        positions[i*3] += vels[i*3]*delta;
        positions[i*3+1] += vels[i*3+1]*delta;
        if (positions[i*3+2] < -4) {
          positions[i*3]= (Math.random()-0.5)*0.5;
          positions[i*3+1]= (Math.random()-0.5)*0.5;
          positions[i*3+2]= -1.2;
        }
      }
      this.thrusterParticles.geometry.attributes.position.needsUpdate = true;
      this.thrusterParticles.points.material.opacity = 0.2 + speedFactor*0.8;
    }

    // Cámara
    this.updateCamera(delta);

    // Límites suaves sistema solar
    const distToSun = this.position.length();
    if (distToSun > 350) {
      const toCenter = this.position.clone().normalize().multiplyScalar(-1);
      this.velocity.addScaledVector(toCenter, delta*10);
    }

    // Regeneración leve salud
    if (this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + delta*0.5);
    }
  }

  updateCamera(delta) {
    if (this.cameraMode === 'third') {
      const offset = this.cameraOffsetThird.clone().applyQuaternion(this.group.quaternion);
      const targetPos = this.position.clone().add(offset);
      this.camera.position.lerp(targetPos, this.cameraLerp);

      const lookOffset = this.cameraLookAtOffset.clone().applyQuaternion(this.group.quaternion);
      const lookTarget = this.position.clone().add(lookOffset);
      // Suavizar lookAt con dummy
      if (!this._lookAt) this._lookAt = lookTarget.clone();
      this._lookAt.lerp(lookTarget, this.cameraLerp);
      this.camera.lookAt(this._lookAt);
    } else if (this.cameraMode === 'first') {
      const offset = this.cameraOffsetFirst.clone().applyQuaternion(this.group.quaternion);
      const targetPos = this.position.clone().add(offset);
      this.camera.position.lerp(targetPos, 0.15);
      const look = this.position.clone().add(new THREE.Vector3(0,0,20).applyQuaternion(this.group.quaternion));
      if (!this._lookAt) this._lookAt = look.clone();
      this._lookAt.lerp(look, 0.12);
      this.camera.lookAt(this._lookAt);
    }
  }

  toggleCameraMode() {
    this.cameraMode = this.cameraMode === 'third' ? 'first' : 'third';
    return this.cameraMode;
  }

  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
    // flash
    if (this.mesh) {
      this.mesh.traverse(o => {
        if (o.isMesh && o.material) {
          o.material.emissive = new THREE.Color(0xff0000);
          setTimeout(()=> { if(o.material) o.material.emissive.set(0x000000); }, 120);
        }
      });
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
    const deposited = { ...this.materials, count: this.trashCount };
    this.trashCount = 0;
    // no resetea materiales? en realidad se transfieren a refinería, así que reseteamos temporal
    const copy = {...this.materials};
    Object.keys(this.materials).forEach(k=> this.materials[k]=0);
    return { materials: copy, count: deposited.count };
  }
}
