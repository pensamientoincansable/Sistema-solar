import * as THREE from 'three';
import { loadModel, mergeToSingleGeometry } from '../utils/ModelLibrary.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * WaterSystem - Gotas de agua (modelo assets/drop_of_water) alrededor de la
 * Tierra (y algunas en Neptuno). Son el origen principal de 💧 agua, necesaria
 * para desbloquear Neo-Terra y Abismo Azul. La cantidad está limitada para que
 * siga siendo útil sin saturar el espacio.
 *
 * Todas las gotas se dibujan con un único InstancedMesh (1 draw call) y
 * orbitan con su planeta (posición relativa al planeta).
 */
export class WaterSystem {
  constructor(scene, solarSystem, quality) {
    this.scene = scene;
    this.solarSystem = solarSystem;
    this.quality = quality || {};
    this.max = this.quality.waterCount || 56;
    this.drops = [];
    this.valuePerDrop = 5;
    this.elapsed = 0;

    this.material = this._createMaterial();
    // Geometría provisional (esfera deformada) hasta que cargue el GLB
    const fallback = new THREE.SphereGeometry(0.38, 16, 12);
    fallback.scale(1, 1.2, 1);
    this.mesh = new THREE.InstancedMesh(fallback, this.material, this.max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; // las instancias se mueven con el planeta
    this.mesh.name = 'water-drops';
    this.mesh.renderOrder = 2;
    this.scene.add(this.mesh);

    this._spawnAll();
    this.update(0, null); // colocar las instancias desde el primer frame

    loadModel('waterDrop').then((gltf) => {
      const geo = mergeToSingleGeometry(gltf, 0.95);
      if (!geo) return;
      const old = this.mesh.geometry;
      this.mesh.geometry = geo;
      old.dispose();
    });
  }

  _createMaterial() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x3aa8ff,
      emissive: 0x0b4a8a,
      emissiveIntensity: 0.7,
      roughness: 0.06,
      metalness: 0.15,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    });
    // Borde brillante tipo Fresnel: la gota se lee como agua sin pagar la
    // transmisión (doble render) de MeshPhysicalMaterial.
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        float rimF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
        float rimP = pow(rimF, 2.2);
        gl_FragColor.rgb += rimP * vec3(0.55, 0.85, 1.0) * 0.9;
        gl_FragColor.a = clamp(gl_FragColor.a + rimP * 0.4, 0.0, 1.0);`
      );
    };
    return mat;
  }

  _planetsForWater() {
    const ss = this.solarSystem;
    if (!ss) return {};
    const earth = ss.getPlanetById('earth');
    const neptune = ss.getPlanetById('neptune');
    return { earth, neptune };
  }

  _randomDrop(drop) {
    const { earth, neptune } = this._planetsForWater();
    // 85 % alrededor de la Tierra, 15 % alrededor de Neptuno
    const planet = (Math.random() < 0.85 || !neptune) ? earth : neptune;
    drop.planet = planet || null;
    const r = (planet ? planet.config.radius : 5) + 4 + Math.random() * 26;
    const a = Math.random() * Math.PI * 2;
    drop.radius = r;
    drop.angle = a;
    drop.height = (Math.random() - 0.5) * 14;
    drop.orbitSpeed = (0.02 + Math.random() * 0.05) * (Math.random() < 0.5 ? -1 : 1);
    drop.phase = Math.random() * Math.PI * 2;
    drop.scale = 0.7 + Math.random() * 0.45;
    drop.spin = (Math.random() - 0.5) * 1.2;
    drop.alive = true;
    drop.respawn = 0;
    drop.pulled = null; // desplazamiento extra por el imán
  }

  _spawnAll() {
    for (let i = 0; i < this.max; i++) {
      const d = { index: i, pos: new THREE.Vector3() };
      this._randomDrop(d);
      this.drops.push(d);
    }
  }

  /** Posición en el mundo de una gota (calculada en update). */
  getPosition(drop) { return drop.pos; }

  countAlive() {
    let n = 0;
    for (const d of this.drops) if (d.alive) n++;
    return n;
  }

  /**
   * Actualiza las gotas y recoge las que toca WALL·E.
   * Devuelve { collected, full }.
   */
  update(delta, walle) {
    this.elapsed += delta;
    let collected = 0;
    let full = false;
    const t = this.elapsed;
    const canCollect = walle && !walle.cargoFull;
    const pickR = walle ? (walle.pickupRadius || 4.5) + 0.6 : 0;
    const magR = walle && canCollect ? walle.magnetRadius : 0;

    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i];
      if (!d.alive) {
        d.respawn -= delta;
        if (d.respawn <= 0) this._randomDrop(d);
        else { this.mesh.setMatrixAt(i, _zero); continue; }
      }

      d.angle += d.orbitSpeed * delta;
      const center = d.planet ? d.planet.worldPosition : _v.set(0, 0, 0);
      d.pos.set(
        center.x + Math.cos(d.angle) * d.radius,
        center.y + d.height + Math.sin(t * 0.8 + d.phase) * 0.6,
        center.z + Math.sin(d.angle) * d.radius
      );
      if (d.pulled) d.pos.add(d.pulled);

      if (walle) {
        const dist = d.pos.distanceTo(walle.position);
        if (dist < magR && dist > 0.01) {
          // Imán: la gota se desplaza hacia WALL·E
          if (!d.pulled) d.pulled = new THREE.Vector3();
          const k = Math.min(1, (16 + (magR - dist) * 3) * delta / dist);
          _p.copy(walle.position).sub(d.pos).multiplyScalar(k);
          d.pulled.add(_p);
          d.pos.add(_p);
        }
        if (dist < pickR) {
          if (walle.addCargo('water', this.valuePerDrop)) {
            d.alive = false;
            d.respawn = 6 + Math.random() * 8;
            collected++;
            this.mesh.setMatrixAt(i, _zero);
            continue;
          } else {
            full = true;
          }
        }
      }

      const s = d.scale * (1 + Math.sin(t * 2.2 + d.phase) * 0.06);
      _e.set(Math.sin(t * 0.5 + d.phase) * 0.3, t * d.spin + d.phase, 0);
      _q.setFromEuler(_e);
      _s.set(s, s * (1 + Math.sin(t * 3 + d.phase) * 0.05), s);
      _m.compose(d.pos, _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    return { collected, full };
  }

  reset() {
    for (const d of this.drops) this._randomDrop(d);
  }
}
