import * as THREE from 'three';
import { loadModel, normalizeObject } from '../utils/ModelLibrary.js';
import { getGlowTexture } from '../utils/textures.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

/** Paradas de la ruta del mercader (en orden). */
const ROUTE = ['earth', 'mars', 'venus', 'mercury', 'earth', 'jupiter', 'saturn'];

function makeLabelTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const g = c.getContext('2d');
  const r = 26;
  g.fillStyle = 'rgba(10,12,24,0.85)';
  g.strokeStyle = '#ffd000';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(r, 4); g.lineTo(252 - r, 4); g.quadraticCurveTo(252, 4, 252, 4 + r);
  g.lineTo(252, 92 - r); g.quadraticCurveTo(252, 92, 252 - r, 92);
  g.lineTo(r, 92); g.quadraticCurveTo(4, 92, 4, 92 - r);
  g.lineTo(4, 4 + r); g.quadraticCurveTo(4, 4, r, 4);
  g.closePath();
  g.fill();
  g.stroke();
  // Carrito
  g.strokeStyle = '#ffd000';
  g.lineWidth = 5;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(22, 30); g.lineTo(34, 30); g.lineTo(42, 60); g.lineTo(70, 60); g.lineTo(78, 38); g.lineTo(38, 38);
  g.stroke();
  g.fillStyle = '#ffd000';
  g.beginPath(); g.arc(46, 70, 5, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(66, 70, 5, 0, Math.PI * 2); g.fill();
  g.font = 'bold 40px Orbitron, Arial, sans-serif';
  g.textBaseline = 'middle';
  g.fillText('TIENDA', 92, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * TaxiVendor - El taxi B90 de "El quinto elemento" convertido en vendedor
 * ambulante. Recorre una ruta de planetas, se detiene un rato en cada uno y
 * vende armas y mejoras para WALL·E. Si el jugador está cerca, espera.
 */
export class TaxiVendor {
  constructor(scene, solarSystem) {
    this.scene = scene;
    this.solarSystem = solarSystem;
    this.group = new THREE.Group();
    this.group.name = 'taxi-vendor';
    this.body = new THREE.Group();
    this.group.add(this.body);
    this.scene.add(this.group);

    this.length = 8.5;
    this.interactRadius = 12;
    this.routeIndex = 0;
    this.state = 'hover';
    this.stateTime = 0;
    this.hoverDuration = 60;
    this.speed = 17;
    this.velocity = new THREE.Vector3();
    this.elapsed = 0;
    this.facing = new THREE.Quaternion();
    this.visual = null;
    this.stopName = '';

    this._createFallback();
    this._createExtras();
    this._placeAtStop(0, true);

    loadModel('taxi').then((gltf) => {
      if (!gltf) return;
      try {
        const obj = gltf.scene;
        obj.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
        const wrapper = normalizeObject(obj, this.length);
        // El modelo tiene el morro hacia -X: girarlo para que mire hacia +Z
        wrapper.rotation.y = Math.PI / 2;
        if (this.visual) this.body.remove(this.visual);
        this.visual = wrapper;
        this.body.add(wrapper);
      } catch (err) {
        console.warn('[Taxi] No se pudo preparar el modelo', err);
      }
    });
  }

  _createFallback() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffc400, roughness: 0.4, metalness: 0.4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 7.5), bodyMat);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 3.2), new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.2, metalness: 0.6 }));
    cabin.position.set(0, 1.2, -0.4);
    g.add(body, cabin);
    this.visual = g;
    this.body.add(g);
  }

  _createExtras() {
    // Cartel "TIENDA" flotante (sprite, siempre legible)
    const labelMat = new THREE.SpriteMaterial({ map: makeLabelTexture(), transparent: true, depthWrite: false, depthTest: false, fog: false });
    this.label = new THREE.Sprite(labelMat);
    this.label.scale.set(6.4, 2.4, 1);
    this.label.position.y = 4.6;
    this.label.renderOrder = 20;
    this.group.add(this.label);

    // Faros y propulsores (sprites aditivos: sin luces dinámicas)
    const glowTex = getGlowTexture();
    const mk = (color, size, x, y, z) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.scale.setScalar(size);
      s.position.set(x, y, z);
      this.body.add(s);
      return s;
    };
    this.headlights = [mk(0xfff4cc, 2.2, 0.9, 0.1, 4.2), mk(0xfff4cc, 2.2, -0.9, 0.1, 4.2)];
    this.thrusters = [mk(0x66ccff, 2.6, 0.8, 0.2, -4.4), mk(0x66ccff, 2.6, -0.8, 0.2, -4.4)];

    // Anillo de interacción (se ilumina cuando el jugador está en rango)
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(this.interactRadius - 0.6, this.interactRadius, 48),
      new THREE.MeshBasicMaterial({ color: 0xffd000, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -2.2;
    this.ring = ring;
    this.group.add(ring);
  }

  _stopPosition(index, target) {
    const planetId = ROUTE[index % ROUTE.length];
    const planet = this.solarSystem ? this.solarSystem.getPlanetById(planetId) : null;
    if (!planet) return target.set(0, 8, 40);
    const r = planet.config.radius;
    // Lado opuesto a la refinería del planeta, algo elevado
    return target.copy(planet.worldPosition).add(_v2.set(-(r + 12) * 0.6, 5, -(r + 12) * 0.8));
  }

  _planetName(index) {
    const planet = this.solarSystem ? this.solarSystem.getPlanetById(ROUTE[index % ROUTE.length]) : null;
    return planet ? planet.config.name : '';
  }

  _placeAtStop(index, instant = false) {
    this.routeIndex = index % ROUTE.length;
    this.stopName = this._planetName(this.routeIndex);
    if (instant) this._stopPosition(this.routeIndex, this.group.position);
    this.state = 'hover';
    this.stateTime = 0;
    this.hoverDuration = 45 + Math.random() * 35;
  }

  /** Coloca el taxi en una posición concreta (visible desde el spawn del jugador). */
  placeNear(position, lookAt = null) {
    this.group.position.copy(position);
    this.routeIndex = 0;
    this.stopName = this._planetName(0);
    this.state = 'parked';
    this.stateTime = 0;
    this.hoverDuration = 70 + Math.random() * 20;
    this._parkOffset = null;
    if (this.solarSystem) {
      const earth = this.solarSystem.getPlanetById('earth');
      if (earth) this._parkOffset = position.clone().sub(earth.worldPosition);
    }
    if (lookAt) {
      // Solo guiñada: el morro (+Z) apunta hacia `lookAt`
      _v1.subVectors(lookAt, position);
      this.facing.setFromAxisAngle(_up, Math.atan2(_v1.x, _v1.z));
      this.body.quaternion.copy(this.facing);
    }
  }

  get position() { return this.group.position; }

  get isTraveling() { return this.state === 'travel'; }

  isPlayerNear(walle) {
    return !!walle && walle.position.distanceTo(this.group.position) < this.interactRadius;
  }

  update(delta, walle, camera) {
    this.elapsed += delta;
    this.stateTime += delta;
    const pos = this.group.position;
    const distToPlayer = walle ? walle.position.distanceTo(pos) : Infinity;
    const playerClose = distToPlayer < 28;

    if (this.state === 'hover' || this.state === 'parked') {
      // Sigue a su planeta (que orbita)
      if (this.state === 'parked' && this._parkOffset) {
        const earth = this.solarSystem && this.solarSystem.getPlanetById('earth');
        if (earth) _v1.copy(earth.worldPosition).add(this._parkOffset);
        else _v1.copy(pos);
      } else {
        this._stopPosition(this.routeIndex, _v1);
      }
      pos.lerp(_v1, Math.min(1, delta * 1.5));
      // Mirar hacia el jugador cuando se acerca
      if (walle && distToPlayer < 60) {
        _v2.subVectors(walle.position, pos);
        _v2.y = 0;
        if (_v2.lengthSq() > 1) {
          const yaw = Math.atan2(_v2.x, _v2.z);
          _q.setFromAxisAngle(_up, yaw);
          this.facing.slerp(_q, Math.min(1, delta * 1.5));
        }
      }
      if (this.stateTime > this.hoverDuration && !playerClose) {
        this.state = 'travel';
        this.stateTime = 0;
        this.routeIndex = (this.routeIndex + 1) % ROUTE.length;
        this.stopName = this._planetName(this.routeIndex);
      }
    } else if (this.state === 'travel') {
      this._stopPosition(this.routeIndex, _v1);
      _v2.subVectors(_v1, pos);
      const d = _v2.length();
      // Si el jugador lo alcanza en ruta, frena para atenderle
      const spd = playerClose ? 2 : Math.min(this.speed, d * 0.8 + 2);
      _v2.multiplyScalar(spd / (d || 1));
      this.velocity.lerp(_v2, Math.min(1, delta * 1.2));
      pos.addScaledVector(this.velocity, delta);
      if (this.velocity.lengthSq() > 0.5) {
        const yaw = Math.atan2(this.velocity.x, this.velocity.z);
        _q.setFromAxisAngle(_up, yaw);
        this.facing.slerp(_q, Math.min(1, delta * 2));
      }
      if (d < 3) this._placeAtStop(this.routeIndex);
    }

    // Evitar planetas y sol
    if (this.solarSystem) {
      const bodies = this.solarSystem.getBodies();
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        const minD = b.radius + 6;
        if (pos.distanceToSquared(b.position) < minD * minD) {
          _v2.subVectors(pos, b.position).normalize();
          pos.copy(b.position).addScaledVector(_v2, minD);
        }
      }
    }

    // Animación: flotación, alabeo en ruta
    this.body.quaternion.copy(this.facing);
    const bank = this.state === 'travel' ? Math.sin(this.elapsed * 0.8) * 0.06 : 0;
    this.body.rotateZ(bank);
    this.body.position.y = Math.sin(this.elapsed * 1.6) * 0.35;
    const thr = this.state === 'travel' ? 3.4 : 2.0 + Math.sin(this.elapsed * 6) * 0.2;
    for (const t of this.thrusters) t.scale.setScalar(thr);
    this.label.position.y = 4.6 + Math.sin(this.elapsed * 2) * 0.15;
    // De cerca el cartel taparía la vista (ya lo indica el aviso de acción)
    const labelOpacity = THREE.MathUtils.clamp((distToPlayer - 9) / 8, 0, 1);
    this.label.material.opacity = labelOpacity;
    this.label.visible = labelOpacity > 0.02;

    // Anillo de rango de interacción
    const inRange = distToPlayer < this.interactRadius;
    const targetOpacity = inRange ? 0.55 : (distToPlayer < 40 ? 0.18 : 0);
    this.ring.material.opacity += (targetOpacity - this.ring.material.opacity) * Math.min(1, delta * 5);
    this.ring.visible = this.ring.material.opacity > 0.01;
  }

  reset(position = null, lookAt = null) {
    if (position) this.placeNear(position, lookAt);
    else this._placeAtStop(0, true);
    this.velocity.set(0, 0, 0);
  }
}
