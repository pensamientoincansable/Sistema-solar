/**
 * CivAssets - Recursos compartidos del modo civilizar.
 *
 * Todo lo que se repite muchas veces (geometrías de cajas, cilindros, esferas,
 * materiales y texturas de ruido) vive aquí: se crea una vez al entrar en el
 * modo y se libera al salir. Gracias a ello un asentamiento con 40 edificios y
 * 40 civiles usa unas pocas geometrías y materiales en lugar de miles.
 *
 * Además incluye un helper para "cocinar" cada edificio en una única malla:
 * las piezas se fusionan con `mergeGeometries` y el color se guarda en el
 * atributo `color`, así un edificio entero es un solo draw call.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Contexto 2D de un canvas, o null si el entorno no lo permite (Node/jsdom sin
 * el paquete `canvas`). Se prueba una sola vez: las texturas son un extra, el
 * modo civilizar funciona sin ellas.
 */
let _canvas2d = undefined;
function ctx2d(size) {
  if (_canvas2d === undefined) {
    _canvas2d = false;
    try {
      const probe = document.createElement('canvas');
      probe.width = probe.height = 2;
      const ctx = probe.getContext('2d');
      if (ctx && typeof ctx.createRadialGradient === 'function' && typeof ctx.getImageData === 'function') {
        _canvas2d = true;
      }
    } catch (e) { _canvas2d = false; }
  }
  if (!_canvas2d) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    return canvas.getContext('2d') || null;
  } catch (e) {
    return null;
  }
}

/** Ruido determinista y barato (sin dependencias). */
function makeRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Acumulador de piezas: cada `add` clona la geometría, la coloca y le añade un
 * color por vértice. `merge()` devuelve UNA geometría con todo dentro.
 */
export class PartList {
  constructor() {
    this.parts = [];
    this._c = new THREE.Color();
  }

  /**
   * @param {THREE.BufferGeometry} geometry geometría base (compartida)
   * @param {object} o { x,y,z, rx,ry,rz, sx,sy,sz, color }
   */
  add(geometry, o = {}) {
    let g = geometry.clone();
    // Poliedros (octaedro, dodecaedro) no están indexados y el resto sí: se
    // normalizan para que `mergeGeometries` pueda fusionarlos en una sola malla.
    if (g.index) {
      const flat = g.toNonIndexed();
      g.dispose();
      g = flat;
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ');
    q.setFromEuler(e);
    m.compose(
      new THREE.Vector3(o.x || 0, o.y || 0, o.z || 0),
      q,
      new THREE.Vector3(o.sx || 1, o.sy || 1, o.sz || 1)
    );
    g.applyMatrix4(m);
    if (!g.attributes.uv) {
      // mergeGeometries exige los mismos atributos en todas las piezas
      const count = g.attributes.position.count;
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    const col = this._c.set(o.color === undefined ? 0xffffff : o.color);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = col.r;
      colors[i + 1] = col.g;
      colors[i + 2] = col.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.parts.push(g);
    return this;
  }

  /** Fusiona todas las piezas en una sola geometría (o null si no hay nada). */
  merge() {
    if (!this.parts.length) return null;
    const merged = this.parts.length === 1 ? this.parts[0] : mergeGeometries(this.parts, false);
    for (const g of this.parts) if (g !== merged) g.dispose();
    this.parts.length = 0;
    if (!merged) return null;
    merged.computeBoundingSphere();
    return merged;
  }
}

export class CivAssets {
  constructor(options = {}) {
    this.lowres = !!options.lowres;
    this._geo = new Map();
    this._mat = new Map();
    this._tex = new Map();
    this._baseGeo();
  }

  // ------------------------------------------------------------- Geometrías

  /** Geometías que se usan en todas las construcciones (una sola instancia). */
  _baseGeo() {
    const g = (key, geo) => this._geo.set(key, geo);
    g('box', new THREE.BoxGeometry(1, 1, 1));
    g('boxThin', new THREE.BoxGeometry(1, 1, 1));
    g('cyl', new THREE.CylinderGeometry(0.5, 0.5, 1, 12));
    g('cylLow', new THREE.CylinderGeometry(0.5, 0.5, 1, 8));
    g('cyl3', new THREE.CylinderGeometry(0.5, 0.5, 1, 3));
    g('taper', new THREE.CylinderGeometry(0.35, 0.5, 1, 12));
    g('cone', new THREE.ConeGeometry(0.5, 1, 4));
    g('cone8', new THREE.ConeGeometry(0.5, 1, 8));
    g('roof', new THREE.ConeGeometry(0.72, 1, 4));
    g('sphere', new THREE.SphereGeometry(0.5, this.lowres ? 8 : 14, this.lowres ? 6 : 10));
    g('sphereLow', new THREE.SphereGeometry(0.5, 6, 5));
    g('halfSphere', new THREE.SphereGeometry(0.5, this.lowres ? 10 : 18, this.lowres ? 6 : 10, 0, Math.PI * 2, 0, Math.PI / 2));
    g('torus', new THREE.TorusGeometry(0.5, 0.16, 6, this.lowres ? 8 : 14));
    g('plane', new THREE.PlaneGeometry(1, 1));
    g('quad', new THREE.PlaneGeometry(1, 1));
    g('octa', new THREE.OctahedronGeometry(0.6, 0));
    g('dodeca', new THREE.DodecahedronGeometry(0.55, 0));
    g('rock', new THREE.DodecahedronGeometry(0.5, 0));
    g('capsule', new THREE.CapsuleGeometry(0.32, 0.6, 2, this.lowres ? 5 : 8));
    g('ring', new THREE.RingGeometry(0.4, 0.5, this.lowres ? 12 : 24));
    // --- Civiles (proporciones de una persona de ~1,8 u) ---
    g('torso', new THREE.CapsuleGeometry(0.19, 0.36, 3, this.lowres ? 5 : 8));
    g('limb', new THREE.CapsuleGeometry(0.075, 0.47, 2, this.lowres ? 4 : 6));
    g('legLimb', new THREE.CapsuleGeometry(0.1, 0.6, 2, this.lowres ? 4 : 6));
    g('head', new THREE.SphereGeometry(0.21, this.lowres ? 8 : 14, this.lowres ? 6 : 10));
    g('hair', new THREE.SphereGeometry(0.215, this.lowres ? 8 : 12, this.lowres ? 5 : 8, 0, Math.PI * 2, 0, Math.PI * 0.58));
    g('eye', new THREE.SphereGeometry(0.032, 5, 4));
    g('hand', new THREE.SphereGeometry(0.085, 6, 5));
    g('disc', new THREE.CircleGeometry(0.5, this.lowres ? 10 : 18));
  }

  geo(key) { return this._geo.get(key) || null; }

  /**
   * Material compartido para las mallas fusionadas (color por vértice).
   * CivMode lo clona por edificio para poder animar la obra y los daños.
   */
  solidMaterial() {
    if (!this._mat.has('solid')) {
      this._mat.set('solid', new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.78, metalness: 0.08, flatShading: false,
      }));
    }
    return this._mat.get('solid');
  }

  /** Material compartido para piezas sueltas (ruedas, hélices, banderas...). */
  mat(key, params = {}) {
    const id = `${key}|${JSON.stringify(params)}`;
    if (!this._mat.has(id)) {
      this._mat.set(id, new THREE.MeshStandardMaterial({
        color: params.color === undefined ? 0xffffff : params.color,
        roughness: params.roughness === undefined ? 0.6 : params.roughness,
        metalness: params.metalness === undefined ? 0.25 : params.metalness,
        emissive: params.emissive === undefined ? 0x000000 : params.emissive,
        emissiveIntensity: params.emissiveIntensity === undefined ? 1 : params.emissiveIntensity,
        transparent: !!params.transparent,
        opacity: params.opacity === undefined ? 1 : params.opacity,
        side: params.side || THREE.FrontSide,
        depthWrite: params.depthWrite === undefined ? true : params.depthWrite,
      }));
    }
    return this._mat.get(id);
  }

  // -------------------------------------------------------------- Texturas

  /** Textura de suelo con ruido: da grano al terreno sin descargar nada. */
  groundTexture() {
    if (this._tex.has('ground')) return this._tex.get('ground');
    let tex = null;
    const ctx = ctx2d(256);
    if (ctx) {
      const rnd = makeRandom(20260925);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 256, 256);
      // Manchas suaves de tono
      for (let i = 0; i < 90; i++) {
        const x = rnd() * 256;
        const y = rnd() * 256;
        const r = 12 + rnd() * 46;
        const v = 205 + Math.floor(rnd() * 50);
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, `rgba(${v},${v},${v},0.55)`);
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Grano fino
      const img = ctx.getImageData(0, 0, 256, 256);
      for (let i = 0; i < img.data.length; i += 4) {
        const n = (rnd() - 0.5) * 26;
        img.data[i] = Math.max(0, Math.min(255, img.data[i] + n));
        img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + n));
        img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + n));
      }
      ctx.putImageData(img, 0, 0);
      tex = new THREE.CanvasTexture(ctx.canvas);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
    }
    this._tex.set('ground', tex);
    return tex;
  }

  /** Halo radial (sol, farolas, destellos). Devuelve null si no hay canvas. */
  glowTexture() {
    if (this._tex.has('glow')) return this._tex.get('glow');
    let tex = null;
    const ctx = ctx2d(128);
    if (ctx) {
      const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
      grad.addColorStop(0.6, 'rgba(255,255,255,0.12)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
      tex = new THREE.CanvasTexture(ctx.canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    this._tex.set('glow', tex);
    return tex;
  }

  dispose() {
    for (const g of this._geo.values()) { try { g.dispose(); } catch (e) { /* noop */ } }
    for (const m of this._mat.values()) { try { m.dispose(); } catch (e) { /* noop */ } }
    for (const t of this._tex.values()) { try { t && t.dispose(); } catch (e) { /* noop */ } }
    this._geo.clear();
    this._mat.clear();
    this._tex.clear();
  }
}
