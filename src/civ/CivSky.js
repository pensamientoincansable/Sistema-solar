/**
 * CivSky - Cielo y entorno del modo civilizar.
 *
 * La colonia se dibuja como un diorama flotante sobre la superficie del
 * planeta, así que necesita su propio cielo: bóveda con degradado, sol,
 * estrellas, la curvatura del planeta bajo los pies y polvo en suspensión.
 *
 * Todo esto sustituye a la escena espacial (que se oculta al aterrizar): antes
 * el sol y los anillos/la luna de algunos planetas atravesaban el terreno y el
 * resplandor del sol inundaba la pantalla en Mercurio y Venus.
 */
import * as THREE from 'three';

/** Dirección del sol en el espacio local de la colonia (= luz direccional). */
export const SUN_DIR = new THREE.Vector3(40, 80, 30).normalize();

/** Radio de la "esfera planeta" sobre la que se apoya la colonia. */
export const PLANET_BODY_RADIUS = 900;
/** Radio de la bóveda del cielo. */
const SKY_RADIUS = 2400;
/** Distancia a la que se dibuja el sol (sprites sin atenuación de tamaño). */
const SUN_DISTANCE = 2200;

/**
 * Curvatura del planeta: cuánto baja el suelo a `r` unidades del centro.
 * Coincide con la esfera del cuerpo planetario (radio R centrada en y = -R),
 * de modo que el disco de terreno encaja con ella sin dejar un escalón.
 */
export function curvature(r) {
  const R = PLANET_BODY_RADIUS;
  return r >= R ? -R : Math.sqrt(Math.max(0, R * R - r * r)) - R;
}

/** Altura real del suelo: relieve local + curvatura del planeta. */
export function surfaceHeight(x, z, heightAt) {
  return heightAt(x, z) + curvature(Math.hypot(x, z));
}

const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = `
uniform vec3 topColor;
uniform vec3 horizonColor;
uniform vec3 sunColor;
uniform vec3 sunDir;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = mix(horizonColor, topColor, pow(h, 0.7));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  col += sunColor * (pow(s, 5.0) * 0.30 + pow(s, 140.0) * 1.10 + pow(s, 1400.0) * 2.60);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const GROUND_VERT = `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const GROUND_FRAG = `
uniform vec3 surfaceColor;
uniform vec3 deepColor;
uniform vec3 hazeColor;
varying vec3 vWorld;
void main() {
  float n = sin(vWorld.x * 0.035) * cos(vWorld.z * 0.031)
          + sin(vWorld.x * 0.011 + vWorld.z * 0.017) * 1.4;
  vec3 col = mix(surfaceColor, deepColor, clamp(n * 0.5 + 0.5, 0.0, 1.0) * 0.75);
  float d = length(vWorld - cameraPosition);
  col = mix(col, hazeColor, smoothstep(150.0, 950.0, d));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class CivSky {
  /**
   * @param {CivAssets} assets recursos compartidos
   * @param {object} theme tema del planeta (PLANET_CIV)
   */
  constructor(assets, theme) {
    this.group = new THREE.Group();
    this.group.name = 'civ-sky';
    this.time = 0;

    const sky = new THREE.Color(theme.sky);
    const ground = new THREE.Color(theme.ground);
    const topColor = sky.clone().lerp(new THREE.Color(0x000010), 0.55);
    const horizonColor = sky.clone().lerp(new THREE.Color(0xffffff), 0.45).lerp(ground, 0.28);
    const sunColor = new THREE.Color(0xffd9a0);

    // --- Bóveda del cielo -------------------------------------------------
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: topColor },
        horizonColor: { value: horizonColor },
        sunColor: { value: sunColor },
        sunDir: { value: SUN_DIR.clone() },
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 32, 20), this.skyMat);
    dome.name = 'civ-sky-dome';
    dome.renderOrder = -1000;
    dome.frustumCulled = false;
    this.group.add(dome);

    // --- Superficie curva del planeta ------------------------------------
    this.groundMat = new THREE.ShaderMaterial({
      uniforms: {
        surfaceColor: { value: ground.clone().lerp(new THREE.Color(0xffffff), 0.12) },
        deepColor: { value: new THREE.Color(theme.rock) },
        hazeColor: { value: horizonColor.clone() },
      },
      vertexShader: GROUND_VERT,
      fragmentShader: GROUND_FRAG,
      fog: false,
    });
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(PLANET_BODY_RADIUS, 48, 32),
      this.groundMat
    );
    body.name = 'civ-planet-body';
    body.position.y = -PLANET_BODY_RADIUS;
    this.group.add(body);

    // --- Sol (disco + halo) ----------------------------------------------
    const glow = assets.glowTexture();
    if (glow) {
      const disc = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glow, color: 0xfff2d8, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false, fog: false,
      }));
      disc.scale.set(0.14, 0.14, 1);
      disc.position.copy(SUN_DIR).multiplyScalar(SUN_DISTANCE);
      disc.renderOrder = -990;
      this.group.add(disc);

      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glow, color: 0xffc880, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false, fog: false,
      }));
      halo.scale.set(0.55, 0.55, 1);
      halo.position.copy(SUN_DIR).multiplyScalar(SUN_DISTANCE * 0.99);
      halo.renderOrder = -991;
      this.group.add(halo);
    }

    // --- Estrellas (sesgadas al hemisferio alto: de día casi no se ven) ----
    const count = 900;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const u = Math.random() * Math.PI * 2;
      const v = Math.pow(Math.random(), 0.6);
      const y = v * 0.95 + 0.02;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      pos[i * 3] = Math.cos(u) * r * SKY_RADIUS * 0.92;
      pos[i * 3 + 1] = y * SKY_RADIUS * 0.92;
      pos[i * 3 + 2] = Math.sin(u) * r * SKY_RADIUS * 0.92;
      c.setHSL(0.55 + Math.random() * 0.12, 0.35, 0.72 + Math.random() * 0.28);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.starMat = new THREE.PointsMaterial({
      size: 2.0, sizeAttenuation: false, vertexColors: true, transparent: true,
      opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    const stars = new THREE.Points(starGeo, this.starMat);
    stars.name = 'civ-stars';
    stars.renderOrder = -995;
    stars.frustumCulled = false;
    this.group.add(stars);

    // --- Polvo en suspensión ---------------------------------------------
    const dustCount = 140;
    const dpos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dpos[i * 3] = (Math.random() - 0.5) * 130;
      dpos[i * 3 + 1] = Math.random() * 22 + 0.5;
      dpos[i * 3 + 2] = (Math.random() - 0.5) * 130;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
    this.dustMat = new THREE.PointsMaterial({
      size: 0.5, sizeAttenuation: true, color: 0xfff0d0, transparent: true, opacity: 0.35,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    this.dust = new THREE.Points(dustGeo, this.dustMat);
    this.dust.name = 'civ-dust';
    this.dust.renderOrder = 5;
    this.group.add(this.dust);
  }

  update(delta) {
    this.time += delta;
    if (this.dust) {
      this.dust.rotation.y += delta * 0.012;
      this.dust.position.y = Math.sin(this.time * 0.25) * 0.6;
    }
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) { try { o.geometry.dispose(); } catch (e) { /* noop */ } }
      const m = o.material;
      if (m) {
        const list = Array.isArray(m) ? m : [m];
        for (const mm of list) { try { mm.dispose(); } catch (e) { /* noop */ } }
      }
    });
  }
}
