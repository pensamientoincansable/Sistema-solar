import * as THREE from 'three';
import { assetUrl } from '../utils/assets.js';

/**
 * Carga una textura desde public/ con fallback silencioso.
 * Devuelve la textura (que se rellena de forma asíncrona) o null si no hay ruta.
 */
function loadTexture(textureLoader, path, onError, lowres = false) {
  if (!path || !textureLoader) return null;
  try {
    // En móvil se usan las versiones 1024×512 (public/textures/lowres): 4× menos
    // memoria de GPU y ~10× menos descarga que las originales de 2048×1024.
    const finalPath = (lowres && /_baseColor\.jpe?g$/.test(path)) ? path.replace('textures/', 'textures/lowres/') : path;
    const tex = textureLoader.load(
      assetUrl(finalPath),
      undefined,
      undefined,
      () => {
        console.warn(`[Planet] No se pudo cargar ${path}, usando color de respaldo`);
        if (onError) onError();
      }
    );
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  } catch (e) {
    console.warn(`[Planet] Excepción cargando ${path}:`, e);
    return null;
  }
}

export class Planet {
  constructor(config, textureLoader, options = {}) {
    this.config = config;
    const lowres = !!options.lowres;
    // Posición en el mundo cacheada una vez por frame (ver update()).
    this.worldPosition = new THREE.Vector3();
    this.group = new THREE.Group();
    this.group.name = config.id;

    // Segmentos según tamaño: los gigantes gaseosos se ven de cerca más a menudo
    // En móvil (lowres) menos teselación: la diferencia no se aprecia en pantalla pequeña
    const segments = lowres ? (config.radius >= 9 ? 40 : 32) : (config.radius >= 9 ? 64 : 48);
    const geometry = new THREE.SphereGeometry(config.radius, segments, segments);

    const material = new THREE.MeshStandardMaterial({
      color: config.color,
      roughness: 0.85,
      metalness: 0.05
    });

    // Textura real del repositorio (public/textures). Si falla, queda el color sólido.
    const texture = loadTexture(textureLoader, config.texture, () => {
      material.map = null;
      material.color.set(config.color);
      material.needsUpdate = true;
    }, lowres);
    if (texture) {
      material.map = texture;
      material.color.set(0xffffff);
    }

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.name = `${config.id}_mesh`;
    this.group.add(this.mesh);

    // Atmósfera sutil para planetas con atmósfera densa
    if (['earth', 'venus', 'mars'].includes(config.id)) {
      try {
        const atmGeo = new THREE.SphereGeometry(config.radius * 1.08, lowres ? 24 : 32, lowres ? 24 : 32);
        const atmMat = new THREE.MeshBasicMaterial({
          color: config.color,
          transparent: true,
          opacity: 0.15,
          side: THREE.BackSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });
        const atm = new THREE.Mesh(atmGeo, atmMat);
        this.group.add(atm);
      } catch (e) {
        console.warn(`[Planet] Atmósfera ${config.id} falló:`, e);
      }
    }

    // Anillos (Saturno)
    if (config.hasRings) {
      try {
        const ringGeo = new THREE.RingGeometry(config.radius * 1.5, config.radius * 2.5, 96);
        // Remapear UVs radialmente para que la textura de anillo (una franja) se lea por radio
        const pos = ringGeo.attributes.position;
        const uv = ringGeo.attributes.uv;
        const inner = config.radius * 1.5;
        const outer = config.radius * 2.5;
        const v3 = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          v3.fromBufferAttribute(pos, i);
          const r = v3.length();
          uv.setXY(i, (r - inner) / (outer - inner), 0.5);
        }
        uv.needsUpdate = true;

        let ringMat;
        const ringTex = loadTexture(textureLoader, config.ringTexture);
        if (ringTex) {
          ringMat = new THREE.MeshBasicMaterial({
            map: ringTex,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9,
            depthWrite: false
          });
        } else {
          ringMat = new THREE.MeshBasicMaterial({
            color: 0xc9b98a,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.5,
            depthWrite: false
          });
        }
        const rings = new THREE.Mesh(ringGeo, ringMat);
        rings.rotation.x = Math.PI / 2.5;
        this.group.add(rings);
        this.rings = rings;
      } catch (e) {
        console.warn(`[Planet] Anillos ${config.id} fallaron:`, e);
      }
    }

    // Luna (solo Tierra)
    if (config.hasMoon) {
      try {
        const moonGeo = new THREE.SphereGeometry(config.radius * 0.27, lowres ? 20 : 32, lowres ? 20 : 32);
        const moonMat = new THREE.MeshStandardMaterial({
          color: 0xbbbbbb,
          roughness: 0.95,
          metalness: 0
        });
        const moonTex = loadTexture(textureLoader, config.moonTexture, () => {
          moonMat.map = null;
          moonMat.color.set(0xbbbbbb);
          moonMat.needsUpdate = true;
        }, lowres);
        if (moonTex) {
          moonMat.map = moonTex;
          moonMat.color.set(0xffffff);
        }
        const moon = new THREE.Mesh(moonGeo, moonMat);
        moon.position.set(config.radius * 3, 0, 0);
        this.moon = moon;
        const moonOrbit = new THREE.Group();
        moonOrbit.add(moon);
        this.group.add(moonOrbit);
        this.moonOrbit = moonOrbit;
      } catch (e) {
        console.warn(`[Planet] Luna ${config.id} falló:`, e);
      }
    }

    // Órbita alrededor del sol
    this.orbitGroup = new THREE.Group();
    this.orbitGroup.add(this.group);
    this.group.position.x = config.distance;
    // Fase orbital inicial distinta por planeta para que no empiecen alineados
    this.orbitGroup.rotation.y = (config.initialAngle !== undefined)
      ? config.initialAngle
      : (config.distance * 0.37) % (Math.PI * 2);

    // Datos gameplay: las colonias se gestionan exclusivamente en CivMode,
    // nunca como estructuras orbitales anexadas a este grupo.
    this.trashCollected = 0;

    // Punto de interés para refinería
    this.refineryPosition = new THREE.Vector3(config.distance + config.radius + 8, 0, 0);
    this._updateWorldPosition();
  }

  /** Posición analítica: el grupo está en (distance, 0, 0) dentro de orbitGroup (rotación Y). */
  _updateWorldPosition() {
    const a = this.orbitGroup.rotation.y;
    const d = this.config.distance;
    this.worldPosition.set(Math.cos(a) * d, 0, -Math.sin(a) * d);
  }

  update(delta, elapsed) {
    try {
      // Rotación propia
      if (this.mesh) this.mesh.rotation.y += this.config.rotationSpeed * delta * 10;
      // Órbita
      if (this.orbitGroup) this.orbitGroup.rotation.y += this.config.orbitSpeed * delta * 0.5;

      if (this.moonOrbit) {
        this.moonOrbit.rotation.y += 0.01 * delta * 10;
        if (this.moon) this.moon.rotation.y += 0.005 * delta * 10;
      }
      if (this.rings) {
        this.rings.rotation.z += 0.0005 * delta * 10;
      }
      this._updateWorldPosition();
    } catch (e) {
      console.error('[Planet] update error:', e);
    }
  }

  /** Copia de la posición en el mundo (sin recalcular matrices). */
  getWorldPosition(target = new THREE.Vector3()) {
    return target.copy(this.worldPosition);
  }

}
