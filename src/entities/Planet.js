import * as THREE from 'three';

export class Planet {
  constructor(config, textureLoader) {
    this.config = config;
    this.group = new THREE.Group();
    this.group.name = config.id;

    const geometry = new THREE.SphereGeometry(config.radius, 64, 64);
    let material;

    // Intentar cargar textura real del repo. Si falla, usar color sólido como fallback.
    const texPath = config.texture;
    if (texPath) {
      try {
        const texture = textureLoader.load(
          texPath,
          // onLoad
          () => {
            try { if (material) material.needsUpdate = true; } catch (e) {}
          },
          // onProgress
          undefined,
          // onError
          (err) => {
            console.warn(`[Planet] No se pudo cargar ${texPath}, usando color fallback`);
            try {
              if (material) {
                material.map = null;
                material.color.set(config.color);
                material.needsUpdate = true;
              }
            } catch (e) {}
          }
        );
        try { texture.colorSpace = THREE.SRGBColorSpace; } catch (e) {}

        material = new THREE.MeshStandardMaterial({
          map: texture,
          roughness: 0.8,
          metalness: 0.1,
          color: 0xffffff
        });
      } catch (e) {
        console.warn(`[Planet] Excepción al iniciar carga de ${texPath}:`, e);
        material = new THREE.MeshStandardMaterial({
          color: config.color,
          roughness: 0.8,
          metalness: 0.1
        });
      }
    } else {
      material = new THREE.MeshStandardMaterial({
        color: config.color,
        roughness: 0.8,
        metalness: 0.1
      });
    }

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.name = `${config.id}_mesh`;
    this.group.add(this.mesh);

    // Atmósfera sutil para planetas con atmósfera densa
    if (['earth', 'venus', 'mars'].includes(config.id)) {
      try {
        const atmGeo = new THREE.SphereGeometry(config.radius * 1.08, 32, 32);
        const atmMat = new THREE.MeshBasicMaterial({
          color: config.color,
          transparent: true,
          opacity: 0.15,
          side: THREE.BackSide,
          blending: THREE.AdditiveBlending
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
        const ringGeo = new THREE.RingGeometry(config.radius * 1.5, config.radius * 2.5, 64);
        let ringMat;
        if (config.ringTexture) {
          try {
            const ringTex = textureLoader.load(
              config.ringTexture,
              undefined,
              undefined,
              () => { console.warn(`[Planet] Anillo ${config.id} sin textura, usando color`); }
            );
            ringTex.colorSpace = THREE.SRGBColorSpace;
            ringMat = new THREE.MeshBasicMaterial({
              map: ringTex,
              side: THREE.DoubleSide,
              transparent: true,
              opacity: 0.8
            });
          } catch (e) {
            ringMat = new THREE.MeshBasicMaterial({
              color: 0xaaaaaa,
              side: THREE.DoubleSide,
              transparent: true,
              opacity: 0.5
            });
          }
        } else {
          ringMat = new THREE.MeshBasicMaterial({
            color: 0xaaaaaa,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.5
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
    if (config.hasMoon && config.moonTexture) {
      try {
        const moonGeo = new THREE.SphereGeometry(config.radius * 0.27, 32, 32);
        const moonTex = textureLoader.load(
          config.moonTexture,
          undefined,
          undefined,
          () => { console.warn(`[Planet] Luna ${config.id} sin textura`); }
        );
        if (moonTex) moonTex.colorSpace = THREE.SRGBColorSpace;
        const moonMat = new THREE.MeshStandardMaterial({
          map: moonTex,
          roughness: 0.9,
          color: moonTex ? 0xffffff : config.color
        });
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

    // Datos gameplay
    this.civilizationLevel = 0;
    this.trashCollected = 0;
    this.builtStructures = [];

    // Punto de interés para refinería
    this.refineryPosition = new THREE.Vector3(config.distance + config.radius + 8, 0, 0);
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
    } catch (e) {
      console.error('[Planet] update error:', e);
    }
  }

  getWorldPosition() {
    try {
      const pos = new THREE.Vector3();
      this.group.getWorldPosition(pos);
      return pos;
    } catch (e) {
      console.error('[Planet] getWorldPosition error:', e);
      return new THREE.Vector3();
    }
  }

  addCivilizationStructure(type, scene) {
    try {
      const geo = type === 'dome'
        ? new THREE.SphereGeometry(1.2, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2)
        : new THREE.BoxGeometry(1.5, 2, 1.5);
      const mat = new THREE.MeshStandardMaterial({
        color: this.config.color,
        emissive: this.config.color,
        emissiveIntensity: 0.2,
        roughness: 0.5,
        metalness: 0.6
      });
      const mesh = new THREE.Mesh(geo, mat);
      const angle = Math.random() * Math.PI * 2;
      const r = this.config.radius + 0.6 + Math.random() * 0.8;
      mesh.position.set(
        Math.cos(angle) * r,
        (Math.random() - 0.5) * r * 0.5,
        Math.sin(angle) * r
      );
      mesh.lookAt(0, 0, 0);
      mesh.castShadow = true;
      this.group.add(mesh);
      this.builtStructures.push(mesh);
      this.civilizationLevel++;
      return mesh;
    } catch (e) {
      console.error('[Planet] addCivilizationStructure error:', e);
      return null;
    }
  }
}
