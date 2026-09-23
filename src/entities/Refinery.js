import * as THREE from 'three';

export class Refinery {
  constructor(scene, solarSystem) {
    this.scene = scene;
    this.solarSystem = solarSystem;
    this.group = new THREE.Group();
    this.stations = [];
    try { this.init(); } catch (e) { console.error('[Refinery] init error:', e); }
  }

  init() {
    try {
      // Estación central cerca del sol
      const central = this.createStation(new THREE.Vector3(0, 12, -25), 'central', 0xffcc00);
      central.userData.label = 'Refinería Central';
    } catch (e) {
      console.error('[Refinery] Estación central falló:', e);
    }

    if (this.solarSystem && this.solarSystem.planets) {
      this.solarSystem.planets.forEach(planet => {
        try {
          const pos = planet.refineryPosition;
          const stationPos = new THREE.Vector3(pos.x, 6, pos.z);
          const station = this.createStation(stationPos, planet.config.id, planet.config.color);
          station.planetId = planet.config.id;
          station.planet = planet;
          station.userData.label = `Refinería ${planet.config.name}`;
          // Posición inicial coherente con la órbita del planeta (update() la mantiene)
          const pw = planet.getWorldPosition();
          station.position.set(pw.x, pw.y + 6, pw.z + planet.config.radius + 6);
        } catch (e) {
          console.error(`[Refinery] Estación ${planet.config.id} falló:`, e);
        }
      });
    }

    this.scene.add(this.group);
  }

  createStation(position, id, color) {
    const stationGroup = new THREE.Group();
    stationGroup.position.copy(position);

    try {
      const baseGeo = new THREE.TorusGeometry(3, 0.4, 12, 32);
      const baseMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7, metalness: 0.6 });
      const base = new THREE.Mesh(baseGeo, baseMat);
      base.rotation.x = Math.PI / 2;
      stationGroup.add(base);
    } catch (e) { console.warn('[Refinery] base falló:', e); }

    try {
      const coreGeo = new THREE.IcosahedronGeometry(1.2, 1);
      const coreMat = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 0.6,
        roughness: 0.3,
        metalness: 0.7,
        transparent: true,
        opacity: 0.9
      });
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.position.y = 0.5;
      stationGroup.add(core);

      const ring1Geo = new THREE.TorusGeometry(2.2, 0.08, 8, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.6 });
      const ring1 = new THREE.Mesh(ring1Geo, ringMat);
      ring1.rotation.x = Math.PI / 3;
      stationGroup.add(ring1);

      const ring2 = new THREE.Mesh(ring1Geo, ringMat.clone());
      ring2.rotation.x = -Math.PI / 4;
      ring2.rotation.y = Math.PI / 4;
      stationGroup.add(ring2);

      const light = new THREE.PointLight(color, 2, 25);
      light.position.y = 1;
      stationGroup.add(light);

      stationGroup.userData.isRefinery = true;
      stationGroup.userData.id = id;
      stationGroup.userData.depositRadius = 8;
      stationGroup.userData.rings = [ring1, ring2];
      stationGroup.userData.core = core;
    } catch (e) { console.warn('[Refinery] core/anillos fallaron:', e); }

    this.group.add(stationGroup);
    this.stations.push(stationGroup);
    return stationGroup;
  }

  update(delta) {
    this.stations.forEach(st => {
      try {
        if (st.userData.rings) {
          st.userData.rings[0].rotation.y += delta * 0.8;
          st.userData.rings[1].rotation.y -= delta * 1.1;
        }
        if (st.userData.core) {
          st.userData.core.rotation.y += delta * 0.5;
          st.userData.core.rotation.x += delta * 0.3;
          const scale = 1 + Math.sin(performance.now() * 0.002) * 0.05;
          st.userData.core.scale.setScalar(scale);
        }
        if (st.planet) {
          const planetWorld = st.planet.getWorldPosition();
          const offset = new THREE.Vector3(0, 6, st.planet.config.radius + 6);
          st.position.copy(planetWorld).add(offset);
        }
      } catch (e) { /* skip station */ }
    });
  }

  checkDeposit(walle) {
    if (!walle) return null;
    for (const st of this.stations) {
      try {
        const dist = st.position.distanceTo(walle.position);
        if (dist < (st.userData.depositRadius || 8)) {
          if (walle.canDeposit()) return st;
        }
      } catch (e) { /* skip */ }
    }
    return null;
  }

  processMaterials(materials, count) {
    const refined = { ...(materials || {}) };
    const bonusTypes = ['polymer', 'glass', 'energy', 'concrete'];
    for (let i = 0; i < (count || 0); i++) {
      if (Math.random() < 0.3) {
        const bt = bonusTypes[Math.floor(Math.random() * bonusTypes.length)];
        refined[bt] = (refined[bt] || 0) + 2;
      }
    }
    return refined;
  }
}
