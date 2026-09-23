import * as THREE from 'three';
import { TRASH_TYPES } from '../config/PlanetsConfig.js';

export class TrashSystem {
  constructor(scene, solarSystem, qualitySettings) {
    this.scene = scene;
    this.solarSystem = solarSystem;
    this.quality = qualitySettings || { trashCount: 100, renderDistance: 800 };
    this.trashList = [];
    this.group = new THREE.Group();
    this.scene.add(this.group);

    try { this.spawnInitial(); } catch (e) { console.error('[Trash] spawnInitial error:', e); }
  }

  createTrash(position, type = null, planetId = null) {
    try {
      const cfg = type || TRASH_TYPES[Math.floor(Math.random() * TRASH_TYPES.length)];
      let geo;
      switch (cfg.model) {
        case 'cube': geo = new THREE.BoxGeometry(cfg.scale, cfg.scale, cfg.scale); break;
        case 'plane': geo = new THREE.PlaneGeometry(cfg.scale * 1.5, cfg.scale); break;
        case 'cylinder': geo = new THREE.CylinderGeometry(cfg.scale * 0.4, cfg.scale * 0.4, cfg.scale * 1.8, 8); break;
        case 'sphere': geo = new THREE.SphereGeometry(cfg.scale * 0.6, 12, 12); break;
        case 'octahedron': geo = new THREE.OctahedronGeometry(cfg.scale * 0.8, 0); break;
        case 'icosahedron': geo = new THREE.IcosahedronGeometry(cfg.scale * 0.7, 0); break;
        default: geo = new THREE.BoxGeometry(1, 1, 1);
      }
      const mat = new THREE.MeshStandardMaterial({
        color: cfg.color,
        roughness: 0.6,
        metalness: 0.5,
        emissive: cfg.color,
        emissiveIntensity: 0.15
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.userData.isTrash = true;

      // Halo para visibilidad
      try {
        const haloGeo = new THREE.SphereGeometry(cfg.scale * 1.2, 8, 8);
        const haloMat = new THREE.MeshBasicMaterial({
          color: cfg.color,
          transparent: true,
          opacity: 0.15,
          blending: THREE.AdditiveBlending,
          side: THREE.BackSide
        });
        const halo = new THREE.Mesh(haloGeo, haloMat);
        mesh.add(halo);
      } catch (e) { /* halo opcional */ }

      const trashObj = {
        mesh,
        config: cfg,
        planetId,
        velocity: new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2),
        rotationSpeed: new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2),
        collected: false,
        value: cfg.value
      };

      this.group.add(mesh);
      this.trashList.push(trashObj);
      return trashObj;
    } catch (e) {
      console.error('[Trash] createTrash error:', e);
      return null;
    }
  }

  spawnInitial() {
    const count = this.quality.trashCount || 100;
    const planets = this.solarSystem ? this.solarSystem.planets : [];

    if (planets.length === 0) {
      // Sin planetas: basura en puntos aleatorios
      for (let i = 0; i < count; i++) {
        const pos = new THREE.Vector3(
          (Math.random() - 0.5) * 200,
          (Math.random() - 0.5) * 100,
          (Math.random() - 0.5) * 200
        );
        this.createTrash(pos);
      }
      return;
    }

    for (let i = 0; i < count; i++) {
      try {
        const planet = planets[Math.floor(Math.random() * planets.length)];
        const planetPos = planet.getWorldPosition();
        const angle = Math.random() * Math.PI * 2;
        const dist = planet.config.radius + 5 + Math.random() * 25;
        const pos = new THREE.Vector3(
          planetPos.x + Math.cos(angle) * dist,
          (Math.random() - 0.5) * 12,
          planetPos.z + Math.sin(angle) * dist
        );
        let type = null;
        if (Math.random() < 0.7) {
          const matMap = {
            'metálico': 'metal', 'ácido': 'polymer', 'orgánico-tech': 'bio',
            'óxido': 'metal', 'gigante': 'gas', 'anillos': 'ice',
            'criogénico': 'ice', 'oscuro': 'crystal'
          };
          const desiredMat = matMap[planet.config.trashType] || 'metal';
          const candidates = TRASH_TYPES.filter(t => t.material === desiredMat);
          if (candidates.length) type = candidates[Math.floor(Math.random() * candidates.length)];
        }
        this.createTrash(pos, type, planet.config.id);
      } catch (e) { /* skip */ }
    }

    // Cinturón asteroides entre Marte y Júpiter
    for (let i = 0; i < 30; i++) {
      try {
        const r = 95 + Math.random() * 20;
        const a = Math.random() * Math.PI * 2;
        const pos = new THREE.Vector3(Math.cos(a) * r, (Math.random() - 0.5) * 10, Math.sin(a) * r);
        this.createTrash(pos);
      } catch (e) { /* skip */ }
    }
  }

  spawnNear(position, amount = 3) {
    if (!position) return;
    for (let i = 0; i < amount; i++) {
      try {
        const offset = new THREE.Vector3((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20);
        this.createTrash(position.clone().add(offset));
      } catch (e) { /* skip */ }
    }
  }

  update(delta, wallePos) {
    const renderDistance = this.quality.renderDistance || 800;
    for (let i = this.trashList.length - 1; i >= 0; i--) {
      try {
        const t = this.trashList[i];
        if (t.collected) continue;
        t.mesh.rotation.x += t.rotationSpeed.x * delta;
        t.mesh.rotation.y += t.rotationSpeed.y * delta;
        t.mesh.rotation.z += t.rotationSpeed.z * delta;
        t.mesh.position.addScaledVector(t.velocity, delta * 0.3);

        if (this.solarSystem) {
          const closest = this.solarSystem.getClosestPlanet(t.mesh.position);
          if (closest.distance < 60 && closest.planet) {
            const dir = closest.planet.getWorldPosition().sub(t.mesh.position).normalize();
            t.velocity.addScaledVector(dir, delta * 0.2);
          }
        }

        const distToPlayer = wallePos ? t.mesh.position.distanceTo(wallePos) : 0;
        t.mesh.visible = distToPlayer < renderDistance;
        if (t.mesh.children[0]) t.mesh.children[0].visible = distToPlayer < 60;
      } catch (e) { /* skip frame */ }
    }
  }

  checkCollection(walle, radius = 4) {
    let collected = 0;
    for (let i = this.trashList.length - 1; i >= 0; i--) {
      try {
        const t = this.trashList[i];
        if (t.collected) continue;
        const dist = t.mesh.position.distanceTo(walle.position);
        if (dist < radius) {
          if (walle.collectTrash(t)) {
            t.collected = true;
            this.group.remove(t.mesh);
            t.mesh.geometry.dispose();
            this.trashList.splice(i, 1);
            collected++;
            // Respawn dinámico
            if (Math.random() < 0.6 && this.solarSystem && this.solarSystem.planets.length) {
              try {
                const planet = this.solarSystem.planets[Math.floor(Math.random() * this.solarSystem.planets.length)];
                const pp = planet.getWorldPosition();
                const ang = Math.random() * Math.PI * 2;
                const d = planet.config.radius + 10 + Math.random() * 30;
                const pos = new THREE.Vector3(pp.x + Math.cos(ang) * d, (Math.random() - 0.5) * 15, pp.z + Math.sin(ang) * d);
                this.createTrash(pos, null, planet.config.id);
              } catch (e) { /* skip */ }
            }
          }
        }
      } catch (e) { /* skip frame */ }
    }
    return collected;
  }

  getCount() { return this.trashList.length; }
}
