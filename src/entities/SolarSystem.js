import * as THREE from 'three';
import { Planet } from './Planet.js';
import { PLANETS_CONFIG } from '../config/PlanetsConfig.js';

export class SolarSystem {
  constructor(scene, textureLoader) {
    this.scene = scene;
    this.textureLoader = textureLoader;
    this.planets = [];
    this.sun = null;
    this.ambientLight = null;
    this.sunLight = null;
    this.stars = null;
    this.orbitLines = [];

    this.init();
  }

  init() {
    // Sol
    try {
      const sunGeo = new THREE.SphereGeometry(10, 64, 64);
      const sunMat = new THREE.MeshBasicMaterial({
        color: 0xffcc00,
        emissive: 0xffaa00,
        emissiveIntensity: 1
      });

      // Intentar textura del sol. Si falla, se mantiene el color sólido.
      if (this.textureLoader) {
        try {
          const sunTex = this.textureLoader.load(
            '/textures/material_baseColor.jpeg',
            () => {
              try { sunMat.needsUpdate = true; } catch (e) {}
            },
            undefined,
            () => {
              console.warn('[SolarSystem] Textura del sol no cargó, usando color sólido');
            }
          );
          try { sunTex.colorSpace = THREE.SRGBColorSpace; } catch (e) {}
          sunMat.map = sunTex;
          sunMat.color.set(0xffffff);
        } catch (e) {
          console.warn('[SolarSystem] Excepción iniciando textura del sol:', e);
        }
      }

      this.sun = new THREE.Mesh(sunGeo, sunMat);
      this.sun.name = 'sun';
      this.scene.add(this.sun);

      // Glow del sol
      try {
        const glowGeo = new THREE.SphereGeometry(12, 32, 32);
        const glowMat = new THREE.MeshBasicMaterial({
          color: 0xffaa00,
          transparent: true,
          opacity: 0.15,
          blending: THREE.AdditiveBlending,
          side: THREE.BackSide
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        this.sun.add(glow);
      } catch (e) {
        console.warn('[SolarSystem] Glow del sol falló:', e);
      }
    } catch (e) {
      console.error('[SolarSystem] Error creando sol:', e);
    }

    // Luz solar
    try {
      this.sunLight = new THREE.PointLight(0xffffff, 3, 1000, 0.5);
      this.sunLight.position.set(0, 0, 0);
      this.sunLight.castShadow = false;
      this.scene.add(this.sunLight);
    } catch (e) {
      console.error('[SolarSystem] SunLight error:', e);
    }

    try {
      this.ambientLight = new THREE.AmbientLight(0x222244, 0.6);
      this.scene.add(this.ambientLight);
    } catch (e) {
      console.error('[SolarSystem] AmbientLight error:', e);
    }

    // Planetas
    if (Array.isArray(PLANETS_CONFIG)) {
      PLANETS_CONFIG.forEach(cfg => {
        try {
          const planet = new Planet(cfg, this.textureLoader);
          this.planets.push(planet);
          this.scene.add(planet.orbitGroup);

          // Línea de órbita
          try {
            const curve = new THREE.EllipseCurve(0, 0, cfg.distance, cfg.distance, 0, Math.PI * 2, false, 0);
            const points = curve.getPoints(128);
            const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
            const lineMat = new THREE.LineBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.12 });
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
      const sizes = new Float32Array(starsCount);
      for (let i = 0; i < starsCount; i++) {
        const r = 800 + Math.random() * 1200;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        pos[i * 3 + 2] = r * Math.cos(phi);
        sizes[i] = Math.random() * 1.5 + 0.2;
      }
      starsGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      starsGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
      const starsMat = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 1.2,
        transparent: true,
        opacity: 0.8,
        sizeAttenuation: true,
        blending: THREE.AdditiveBlending
      });
      this.stars = new THREE.Points(starsGeo, starsMat);
      this.scene.add(this.stars);
    } catch (e) {
      console.error('[SolarSystem] Estrellas error:', e);
    }
  }

  update(delta, elapsed) {
    try {
      if (this.sun) this.sun.rotation.y += 0.0005 * delta * 60;
      if (this.planets) this.planets.forEach(p => { try { p.update(delta, elapsed); } catch(e) {} });
      if (this.stars) this.stars.rotation.y += 0.00002 * delta * 60;
    } catch (e) {
      console.error('[SolarSystem] update error:', e);
    }
  }

  getPlanetById(id) {
    return this.planets.find(p => p.config.id === id);
  }

  getClosestPlanet(position) {
    let closest = null;
    let minDist = Infinity;
    this.planets.forEach(p => {
      try {
        const wp = p.getWorldPosition();
        const d = wp.distanceTo(position);
        if (d < minDist) { minDist = d; closest = p; }
      } catch (e) { /* ignore */ }
    });
    return { planet: closest, distance: minDist };
  }
}
