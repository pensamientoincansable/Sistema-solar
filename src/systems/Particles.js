import * as THREE from 'three';

/**
 * ParticleSystem - Partículas en GPU con un único THREE.Points (1 draw call).
 *
 * Sustituye al sistema anterior, que creaba una malla + geometría por cada
 * chispa (≈12 mallas por explosión) y una PointLight por proyectil. Cada luz
 * nueva cambiaba el número de luces de la escena y obligaba a recompilar los
 * shaders de TODOS los materiales -> tirones notables, sobre todo en móvil.
 *
 * Búfer circular de tamaño fijo: emitir nunca reserva memoria.
 */
const VERT = /* glsl */`
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying vec3 vColor;
varying float vAlpha;
uniform float uScale;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float s = aSize * uScale / max(-mv.z, 0.1);
  gl_PointSize = aAlpha > 0.003 ? clamp(s, 1.0, 180.0) : 0.0;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */`
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  if (d > 1.0) discard;
  float k = 1.0 - d;
  gl_FragColor = vec4(vColor * (0.7 + k * 0.8), k * k * vAlpha);
}`;

const _c = new THREE.Color();
const _size = new THREE.Vector2();

export class ParticleSystem {
  constructor(scene, capacity = 600) {
    this.scene = scene;
    this.capacity = capacity;
    this.cursor = 0;

    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.grow = new Float32Array(capacity);
    this.baseSize = new Float32Array(capacity);
    this.baseAlpha = new Float32Array(capacity);

    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aColor', this.colAttr);
    geo.setAttribute('aSize', this.sizeAttr);
    geo.setAttribute('aAlpha', this.alphaAttr);

    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.scene.add(this.points);
    this._activeCount = 0;

    // Ondas expansivas: pequeño pool de anillos que miran a la cámara
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.82, 1, 40);
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 6;
      this.scene.add(mesh);
      this.rings.push({ mesh, life: 0, maxLife: 1, scale: 1 });
    }
    this._ringCursor = 0;
  }

  /** Emite una partícula. `color` puede ser número hex o THREE.Color. */
  emit(x, y, z, vx, vy, vz, color, size = 0.5, life = 0.6, drag = 0.95, grow = 0, alpha = 1) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    if (typeof color === 'number') _c.setHex(color); else _c.copy(color);
    this.col[i3] = _c.r; this.col[i3 + 1] = _c.g; this.col[i3 + 2] = _c.b;
    this.size[i] = size;
    this.baseSize[i] = size;
    this.alpha[i] = alpha;
    this.baseAlpha[i] = alpha;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.drag[i] = drag;
    this.grow[i] = grow;
    this._activeCount = Math.min(this.capacity, this._activeCount + 1);
  }

  /** Ráfaga esférica de partículas. */
  burst(pos, color, count = 10, speed = 10, size = 0.5, life = 0.7, drag = 0.93) {
    for (let i = 0; i < count; i++) {
      // Dirección aleatoria uniforme
      const u = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const sp = speed * (0.35 + Math.random() * 0.65);
      this.emit(pos.x, pos.y, pos.z, s * Math.cos(t) * sp, u * sp, s * Math.sin(t) * sp,
        color, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.6), drag);
    }
  }

  explosion(pos, color = 0xff8800, scale = 1) {
    const s = Math.max(0.3, scale);
    this.emit(pos.x, pos.y, pos.z, 0, 0, 0, 0xffffff, 5 * s, 0.22, 1, 6, 0.9);   // destello
    this.emit(pos.x, pos.y, pos.z, 0, 0, 0, color, 7 * s, 0.4, 1, 4, 0.6);       // bola de fuego
    this.burst(pos, color, Math.round(12 + 10 * s), 16 * s, 0.55 * s, 0.9);        // chispas
    this.burst(pos, 0x777788, Math.round(4 + 3 * s), 4 * s, 1.4 * s, 1.3, 0.9);    // humo/escombros
    this.ring(pos, color, 5 * s);
  }

  /** Chispas pequeñas de impacto. */
  hit(pos, color = 0xffffff, count = 6) {
    this.burst(pos, color, count, 8, 0.35, 0.35, 0.9);
  }

  /** Partícula estática que se desvanece (estelas). */
  trail(pos, color, size = 0.6, life = 0.35, alpha = 0.8) {
    this.emit(pos.x, pos.y, pos.z, 0, 0, 0, color, size, life, 1, -0.5, alpha);
  }

  ring(pos, color = 0xffffff, scale = 4) {
    const r = this.rings[this._ringCursor];
    this._ringCursor = (this._ringCursor + 1) % this.rings.length;
    r.mesh.position.copy(pos);
    r.mesh.material.color.setHex(typeof color === 'number' ? color : 0xffffff);
    r.mesh.material.opacity = 0.8;
    r.mesh.scale.setScalar(0.2);
    r.mesh.visible = true;
    r.life = 0.45;
    r.maxLife = 0.45;
    r.scale = scale;
  }

  update(delta, camera, renderer) {
    if (renderer && camera) {
      renderer.getDrawingBufferSize(_size);
      this.material.uniforms.uScale.value = _size.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5));
    }
    if (this._activeCount > 0) {
      let alive = 0;
      const n = this.capacity;
      for (let i = 0; i < n; i++) {
        if (this.life[i] <= 0) continue;
        this.life[i] -= delta;
        if (this.life[i] <= 0) {
          this.alpha[i] = 0;
          continue;
        }
        alive++;
        const i3 = i * 3;
        const dragK = Math.pow(this.drag[i], delta * 60);
        this.vel[i3] *= dragK; this.vel[i3 + 1] *= dragK; this.vel[i3 + 2] *= dragK;
        this.pos[i3] += this.vel[i3] * delta;
        this.pos[i3 + 1] += this.vel[i3 + 1] * delta;
        this.pos[i3 + 2] += this.vel[i3 + 2] * delta;
        const t = this.life[i] / this.maxLife[i]; // 1 -> 0
        this.alpha[i] = this.baseAlpha[i] * t;
        this.size[i] = Math.max(0.01, this.baseSize[i] * (1 + this.grow[i] * (1 - t)));
      }
      this._activeCount = alive;
      this.posAttr.needsUpdate = true;
      this.colAttr.needsUpdate = true;
      this.sizeAttr.needsUpdate = true;
      this.alphaAttr.needsUpdate = true;
    }

    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.life -= delta;
      if (r.life <= 0) { r.mesh.visible = false; continue; }
      const t = 1 - r.life / r.maxLife;
      r.mesh.scale.setScalar(0.2 + r.scale * t);
      r.mesh.material.opacity = 0.8 * (1 - t);
      if (camera) r.mesh.quaternion.copy(camera.quaternion);
    }
  }

  clear() {
    this.life.fill(0);
    this.alpha.fill(0);
    this.alphaAttr.needsUpdate = true;
    this._activeCount = 0;
    for (const r of this.rings) r.mesh.visible = false;
  }
}

