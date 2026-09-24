import * as THREE from 'three';
import { Planet } from './Planet.js';
import { PLANETS_CONFIG } from '../config/PlanetsConfig.js';
import { assetUrl } from '../utils/assets.js';

export const SUN_RADIUS = 10;

export class SolarSystem {
  constructor(scene, textureLoader, options = {}) {
    this.scene = scene;
    this.textureLoader = textureLoader;
    this.options = options || {};
    // Cuerpos para colisiones: array reutilizado (antes se creaba cada frame)
    this._bodies = [{ position: new THREE.Vector3(0, 0, 0), radius: SUN_RADIUS, id: 'sun', planet: null }];
    this.planets = [];
    this.sun = null;
    this.sunRadius = SUN_RADIUS;
    this.ambientLight = null;
    this.sunLight = null;
    this.stars = null;
    this.orbitLines = [];

    this.init();
  }

  init() {
    // Sol
    try {
      const sunSeg = this.options.lowres ? 40 : 64;
      const sunGeo = new THREE.SphereGeometry(SUN_RADIUS, sunSeg, sunSeg);
      // MeshBasicMaterial no se ve afectado por luces (el sol emite luz propia).
      // Nota: MeshBasicMaterial NO tiene 'emissive'; pasarlo provocaba warnings.
      const sunMat = new THREE.MeshBasicMaterial({ color: 0xffb830 });

      // Intentar textura del sol. Si falla, se mantiene el color sólido.
      if (this.textureLoader) {
        try {
          const sunTex = this.textureLoader.load(
            assetUrl(this.options.lowres ? 'textures/lowres/material_baseColor.jpeg' : 'textures/material_baseColor.jpeg'),
            undefined,
            undefined,
            () => {
              console.warn('[SolarSystem] Textura del sol no cargó, usando color sólido');
              sunMat.map = null;
              sunMat.color.set(0xffb830);
              sunMat.needsUpdate = true;
            }
          );
          sunTex.colorSpace = THREE.SRGBColorSpace;
          sunMat.map = sunTex;
          sunMat.color.set(0xffffff);
        } catch (e) {
          console.warn('[SolarSystem] Excepción iniciando textura del sol:', e);
        }
      }

      this.sun = new THREE.Mesh(sunGeo, sunMat);
      this.sun.name = 'sun';
      this.scene.add(this.sun);

      // Glow del sol (dos capas aditivas)
      try {
        const mkGlow = (radius, opacity) => {
          const glowGeo = new THREE.SphereGeometry(radius, this.options.lowres ? 20 : 32, this.options.lowres ? 20 : 32);
          const glowMat = new THREE.MeshBasicMaterial({
            color: 0xffaa33,
            transparent: true,
            opacity,
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide,
            depthWrite: false
          });
          return new THREE.Mesh(glowGeo, glowMat);
        };
        this.sun.add(mkGlow(SUN_RADIUS * 1.15, 0.25));
        this.sun.add(mkGlow(SUN_RADIUS * 1.5, 0.08));
      } catch (e) {
        console.warn('[SolarSystem] Glow del sol falló:', e);
      }
    } catch (e) {
      console.error('[SolarSystem] Error creando sol:', e);
    }

    // Luz solar (sin atenuación física agresiva para que Neptuno siga visible)
    try {
      this.sunLight = new THREE.PointLight(0xfff2dd, 3.2, 0, 0.35);
      this.sunLight.position.set(0, 0, 0);
      this.sunLight.castShadow = false;
      this.scene.add(this.sunLight);
    } catch (e) {
      console.error('[SolarSystem] SunLight error:', e);
    }

    try {
      this.ambientLight = new THREE.AmbientLight(0x334466, 0.9);
      this.scene.add(this.ambientLight);
    } catch (e) {
      console.error('[SolarSystem] AmbientLight error:', e);
    }

    // Planetas
    if (Array.isArray(PLANETS_CONFIG)) {
      PLANETS_CONFIG.forEach(cfg => {
        try {
          const planet = new Planet(cfg, this.textureLoader, { lowres: !!this.options.lowres });
          this.planets.push(planet);
          this._bodies.push({ position: planet.worldPosition, radius: cfg.radius, id: cfg.id, planet });
          this.scene.add(planet.orbitGroup);

          // Línea de órbita
          try {
            const curve = new THREE.EllipseCurve(0, 0, cfg.distance, cfg.distance, 0, Math.PI * 2, false, 0);
            const points = curve.getPoints(160);
            const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
            const lineMat = new THREE.LineBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.18 });
            const line = new THREE.LineLoop(lineGeo, lineMat);
            line.rotation.x = Math.PI / 2;
            this.scene.add(line);
            this.orbitLines.push(line);
          } catch (e) {
            console.warn(`[SolarSystem] Línea de órbita ${cfg.id} falló:`, e);
          }
        } catch (err) {
          console.error(`[SolarSystem] Error creando planeta ${cfg.id}:`, err);
        }
      });
    }

    // Estrellas - puntos para fondo
    try {
      const starsCount = 3000;
      const starsGeo = new THREE.BufferGeometry();
      const pos = new Float32Array(starsCount * 3);
      const colors = new Float32Array(starsCount * 3);
      const tmp = new THREE.Color();
      for (let i = 0; i < starsCount; i++) {
        const r = 800 + Math.random() * 1200;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        pos[i * 3 + 2] = r * Math.cos(phi);
        // Ligeras variaciones de color (azuladas / cálidas)
        tmp.setHSL(0.55 + Math.random() * 0.15, Math.random() * 0.4, 0.7 + Math.random() * 0.3);
        colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
      }
      starsGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      starsGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const starsMat = new THREE.PointsMaterial({
        size: 2.2,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        sizeAttenuation: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        // Las estrellas están a 800-2000 u: con la niebla de la escena quedaban
        // casi invisibles. Se excluyen de la niebla.
        fog: false
      });
      this.stars = new THREE.Points(starsGeo, starsMat);
      this.stars.frustumCulled = false;
      this.scene.add(this.stars);
    } catch (e) {
      console.error('[SolarSystem] Estrellas error:', e);
    }
  }

  update(delta, elapsed) {
    try {
      if (this.sun) this.sun.rotation.y += 0.0005 * delta * 60;
      if (this.planets) this.planets.forEach(p => { try { p.update(delta, elapsed); } catch (e) {} });
      if (this.stars) this.stars.rotation.y += 0.00002 * delta * 60;
    } catch (e) {
      console.error('[SolarSystem] update error:', e);
    }
  }

  getPlanetById(id) {
    return this.planets.find(p => p.config.id === id);
  }

  /**
   * Planeta más cercano sin reservar memoria: escribe en `out` ({ planet, distance }).
   * Usa las posiciones cacheadas en Planet.update().
   */
  getClosestPlanetInfo(position, out) {
    let closest = null;
    let minSq = Infinity;
    for (let i = 0; i < this.planets.length; i++) {
      const p = this.planets[i];
      const dSq = p.worldPosition.distanceToSquared(position);
      if (dSq < minSq) { minSq = dSq; closest = p; }
    }
    out.planet = closest;
    out.distance = Math.sqrt(minSq);
    return out;
  }

  getClosestPlanet(position) {
    return this.getClosestPlanetInfo(position, { planet: null, distance: Infinity });
  }

  /**
   * Cuerpos con los que colisionar (sol + planetas): [{ position, radius, id }].
   * Las posiciones son referencias a los vectores cacheados de cada planeta:
   * no se reserva memoria por llamada.
   */
  getBodies() {
    return this._bodies;
  }
}
