/**
 * CivStructures - Recetas de los edificios y elementos del escenario.
 *
 * Cada edificio se "cocina" una sola vez por tipo: las piezas estáticas se
 * fusionan en UNA geometría con color por vértice (un draw call) y las piezas
 * con animación (ruedas, hélices, banderas, llamas...) se devuelven sueltas.
 *
 * `lowres` simplifica las construcciones en móvil: menos piezas y menos
 * segmentos, que a pantalla pequeña no se notan.
 */
import { PartList } from './CivAssets.js';

// ------------------------------------------------------------- Color utils

function hexToRgb(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

function rgbToHex(rgb) {
  return ((Math.round(rgb[0]) & 255) << 16) | ((Math.round(rgb[1]) & 255) << 8) | (Math.round(rgb[2]) & 255);
}

/** Mezcla dos colores (t = 0 -> a, t = 1 -> b). */
function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Aclara (t > 0) u oscurece (t < 0) un color hexadecimal. */
function shade(hex, t) {
  const target = t > 0 ? [255, 255, 255] : [0, 0, 0];
  return rgbToHex(mix(hexToRgb(hex), target, Math.min(1, Math.abs(t))));
}

/** Paleta derivada del tema del planeta: cada colonia tiene su propio acento. */
function palette(theme) {
  return {
    stone: shade(theme.rock, 0.34),
    stoneDark: shade(theme.rock, -0.3),
    trim: shade(theme.sky, 0.6),
    roof: shade(theme.ground, -0.45),
    ground: theme.ground,
    accent: shade(theme.sky, 0.8),
    glowWarm: 0xffd9a0,
    glowCyan: 0x7ff0ff,
  };
}

const C = {
  wood: 0x8a5a2b, woodDark: 0x5f3d1e, woodLight: 0xb08355,
  metal: 0xb9c0c9, dark: 0x2b2f36, rust: 0x7a4a2a,
  soil: 0x6b4b2c, crop: 0x8fd45f, cropDry: 0xd8c25a,
  leaf: 0x3f9c4a, leafDark: 0x2c6b36,
  rock: 0x7d7365, rockDark: 0x5a5248, ore: 0xd8b25a,
  crystal: 0xff5ae0, sand: 0xc9b27e, white: 0xe8eef4,
  red: 0xd8493f,
};

/**
 * Constructor de piezas.
 * - `box/cyl/cone/...` añaden al sólido fusionado con `y` = base de la pieza.
 * - `part(...)` añade una pieza suelta con material propio; ahí `y` es el
 *   CENTRO (se usa como pivote de la animación) y `parent` permite colgarla de
 *   otra pieza (p. ej. los cañones de la torreta giran con su cabezal).
 */
class Kit {
  constructor(assets, pal, lowres) {
    this.assets = assets;
    this.pal = pal;
    this.lowres = lowres;
    this.solid = new PartList();
    this.loose = [];
    this.maxY = 0;
  }

  _y(y, h) {
    this.maxY = Math.max(this.maxY, y + h);
    return y;
  }

  // BoxGeometry y CylinderGeometry tienen el origen en el CENTRO: `y` es la
  // base de la pieza, así que se desplaza media altura.
  box(x, y, z, w, h, d, color, ry = 0, rx = 0) {
    this.solid.add(this.assets.geo('box'), { x, y: this._y(y, h) + h / 2, z, sx: w, sy: h, sz: d, color, ry, rx });
    return this;
  }

  cyl(x, y, z, rt, rb, h, color, ry = 0, seg = 12, rx = 0) {
    const key = seg <= 3 ? 'cyl3' : seg <= 8 ? 'cylLow' : 'cyl';
    this.solid.add(this.assets.geo(key), {
      x, y: this._y(y, h) + h / 2, z, sx: rt * 2, sy: h, sz: rb * 2, color, ry, rx,
    });
    return this;
  }

  taper(x, y, z, rt, rb, h, color, ry = 0) {
    this.solid.add(this.assets.geo('taper'), {
      x, y: this._y(y, h) + h / 2, z, sx: rt * 2, sy: h, sz: rb * 2, color, ry,
    });
    return this;
  }

  cone(x, y, z, r, h, color, ry = 0, seg = 8) {
    this.solid.add(this.assets.geo(seg === 4 ? 'cone' : 'cone8'), {
      x, y: this._y(y, h) + h / 2, z, sx: r * 2, sy: h, sz: r * 2, color, ry,
    });
    return this;
  }

  /** Pirámide de 4 caras (tejado): el cono de 4 segmentos gira 45°. */
  roof(x, y, z, w, h, d, color, ry = 0) {
    this.solid.add(this.assets.geo('roof'), {
      x, y: this._y(y, h) + h / 2, z, sx: w, sy: h, sz: d, color, ry: ry + Math.PI / 4,
    });
    return this;
  }

  /** Frontón triangular (prisma de 3 caras). */
  pediment(x, y, z, w, h, d, color) {
    this.solid.add(this.assets.geo('cyl3'), {
      x, y: this._y(y, h) + h / 2, z, sx: w, sy: h, sz: d, color, ry: Math.PI / 6,
    });
    return this;
  }

  sphere(x, y, z, r, color) {
    this.solid.add(this.assets.geo('sphere'), { x, y, z, sx: r * 2, sy: r * 2, sz: r * 2, color });
    return this;
  }

  dome(x, y, z, r, color) {
    this.solid.add(this.assets.geo('halfSphere'), { x, y, z, sx: r * 2, sy: r, sz: r * 2, color });
    return this;
  }

  torus(x, y, z, r, thickness, color, rx = 0, ry = 0) {
    this.solid.add(this.assets.geo('torus'), { x, y, z, sx: r * 2, sy: r * 2, sz: thickness * 2, color, rx, ry });
    return this;
  }

  octa(x, y, z, r, color, ry = 0) {
    this.solid.add(this.assets.geo('octa'), { x, y, z, sx: r * 2, sy: r * 2, sz: r * 2, color, ry });
    return this;
  }

  dodeca(x, y, z, r, color, ry = 0) {
    this.solid.add(this.assets.geo('dodeca'), { x, y, z, sx: r * 2, sy: r * 2, sz: r * 2, color, ry });
    return this;
  }

  /**
   * Pieza suelta: material propio, animación y pivote propio.
   * @param {string} name spin | turretHead | pulse | cart | flag | blink | child | static
   */
  part(name, geoKey, matParams, t) {
    const geo = this.assets.geo(geoKey);
    if (!geo) return this;
    const mat = this.assets.mat(`${geoKey}:${JSON.stringify(matParams)}`, matParams);
    const s = t.s || 1;
    this.loose.push({
      name, geo, mat, parent: t.parent || null,
      x: t.x || 0, y: t.y || 0, z: t.z || 0,
      rx: t.rx || 0, ry: t.ry || 0, rz: t.rz || 0,
      sx: (t.sx || 1) * s, sy: (t.sy || 1) * s, sz: (t.sz || 1) * s,
      speed: t.speed || 1,
      amp: t.amp || 1,
      axis: t.axis || 'y',
    });
    this.maxY = Math.max(this.maxY, Math.abs(t.y || 0) + Math.abs(t.sy || 1) * s);
    return this;
  }

  /** Ventana emisiva (va en el sólido, pero brilla por el color claro). */
  window(x, y, z, w, h, color) {
    this.box(x, y, z, w, h, 0.09, color === undefined ? this.pal.glowWarm : color);
    return this;
  }
}

// --------------------------------------------------------------- Edificios

function center(kit, pal) {
  const s = pal.stone;
  kit.box(0, 0, 0, 6.6, 0.3, 6.6, pal.stoneDark);                     // explanada
  kit.box(0, 0.3, 0, 5.6, 0.28, 5.2, s);                              // zócalo
  kit.box(0, 0.58, 0, 4.9, 2.0, 4.3, s);                              // sala principal
  for (const cx of [-2.05, 2.05]) {
    for (const cz of [-1.7, 1.7]) kit.cyl(cx, 0.58, cz, 0.17, 0.2, 2.1, pal.trim, 0, 8);
  }
  kit.box(0, 2.68, 0, 5.5, 0.3, 4.7, s);                              // arquitrabe
  kit.pediment(0, 2.98, 0, 5.4, 1.15, 4.5, s);                        // frontón
  kit.box(0, 4.13, 0, 2.2, 0.22, 2.2, pal.stoneDark);                 // tambor
  kit.dome(0, 4.35, 0, 1.15, pal.glowCyan);                           // cúpula
  kit.cyl(0, 5.5, 0, 0.07, 0.09, 0.8, pal.trim, 0, 6);                // aguja
  kit.sphere(0, 6.3, 0, 0.2, pal.glowWarm);                           // faro
  kit.box(0, 0.58, 2.18, 1.15, 1.5, 0.16, C.woodDark);                // portón
  kit.box(0, 1.35, 2.22, 0.5, 0.5, 0.1, C.metal);                     // mirilla
  kit.window(-1.85, 1.35, 2.18, 0.85, 0.75);
  kit.window(1.85, 1.35, 2.18, 0.85, 0.75);
  kit.window(-2.48, 1.35, 0, 0.09, 0.75);
  kit.window(2.48, 1.35, 0, 0.09, 0.75);
  for (let i = 0; i < 3; i++) kit.box(0, 0, 2.6 + i * 0.42, 3.2 - i * 0.3, 0.16, 0.42, s);  // escalinata
  for (const cx of [-3.0, 3.0]) {                                     // farolas
    kit.cyl(cx, 0.3, 2.4, 0.06, 0.08, 1.5, C.dark, 0, 6);
    kit.sphere(cx, 1.85, 2.4, 0.16, pal.glowWarm);
  }
  kit.part('flag', 'cylLow', { color: C.dark, metalness: 0.5 }, { x: 2.1, y: 4.2, z: 1.6, sy: 1.6 });
  kit.part('flag', 'box', { color: pal.accent, roughness: 0.7, metalness: 0.1 }, {
    x: 2.75, y: 4.7, z: 1.6, sx: 1.2, sy: 0.75, sz: 0.07,
  });
  kit.part('pulse', 'sphere', {
    color: pal.glowCyan, emissive: pal.glowCyan, emissiveIntensity: 1.5, roughness: 0.3,
  }, { x: 0, y: 6.3, z: 0 });
}

function house(kit, pal) {
  kit.box(0, 0, 0, 5.0, 0.22, 4.6, pal.stoneDark);
  kit.box(0, 0.22, 0, 4.2, 1.85, 3.8, pal.stone);
  kit.roof(0, 2.07, 0, 5.0, 1.7, 4.6, pal.roof);
  kit.box(0, 2.02, 0, 4.4, 0.14, 4.0, C.woodDark);                    // alero
  kit.box(1.25, 2.2, -1.1, 0.45, 1.3, 0.45, pal.stoneDark);           // chimenea
  kit.box(0, 0.22, 1.93, 0.95, 1.25, 0.14, C.woodDark);               // puerta
  kit.sphere(0.38, 0.8, 2.04, 0.07, C.metal);
  kit.window(-1.35, 0.95, 1.93, 0.8, 0.7);
  kit.window(1.35, 0.95, 1.93, 0.8, 0.7);
  kit.window(-2.13, 0.95, 0, 0.09, 0.7);
  kit.window(2.13, 0.95, 0, 0.09, 0.7);
  kit.box(-1.9, 0, 2.95, 0.12, 0.7, 0.12, C.wood);                   // valla
  kit.box(1.9, 0, 2.95, 0.12, 0.7, 0.12, C.wood);
  kit.box(0, 0.5, 2.95, 3.6, 0.08, 0.08, C.wood);
  kit.cyl(2.65, 0.22, 2.2, 0.06, 0.08, 1.2, C.dark, 0, 6);           // farola
  kit.sphere(2.65, 1.5, 2.2, 0.14, pal.glowWarm);
}

function farm(kit, pal) {
  kit.box(0, 0, 0, 6.2, 0.14, 6.2, C.soil);
  for (let i = -2; i <= 2; i++) {
    kit.box(i * 1.2, 0.14, 0, 0.7, 0.1, 5.6, shade(C.soil, -0.2));    // surcos
    for (let j = -2; j <= 2; j++) {
      const x = i * 1.2;
      const z = j * 1.1;
      if (Math.abs(x) > 2.4 && Math.abs(z) > 1.6) continue;
      kit.cone(x, 0.24, z, 0.3, 0.8, j % 2 ? C.crop : C.cropDry, 0, 6);
    }
  }
  for (const [fx, fz] of [[-2.9, -2.9], [2.9, -2.9], [-2.9, 2.9], [2.9, 2.9]]) {
    kit.cyl(fx, 0.14, fz, 0.08, 0.1, 0.8, C.wood, 0, 6);
  }
  kit.box(0, 0.6, -2.9, 5.8, 0.08, 0.08, C.wood);
  kit.box(0, 0.85, -2.9, 5.8, 0.08, 0.08, C.wood);
  kit.box(2.4, 0.14, 1.9, 1.3, 0.5, 0.9, C.wood);                     // abrevadero
  kit.box(2.4, 0.6, 1.9, 1.1, 0.08, 0.7, 0x4aa8d8);
  kit.cyl(-2.3, 0.14, 1.6, 0.07, 0.07, 1.9, C.woodDark, 0, 6);        // espantapájaros
  kit.box(-2.3, 1.35, 1.6, 1.4, 0.08, 0.08, C.woodDark);
  kit.sphere(-2.3, 2.05, 1.6, 0.24, C.cropDry);
  kit.cyl(-2.6, 0.14, -1.9, 0.45, 0.45, 0.8, C.cropDry, 0, 8, Math.PI / 2); // paca
}

function sawmill(kit, pal) {
  kit.box(-1.0, 0, 0, 3.6, 2.0, 3.0, pal.stone);
  kit.roof(-1.0, 2.0, 0, 4.0, 1.4, 3.4, pal.roof);
  kit.box(-1.0, 0, 1.55, 0.9, 1.2, 0.12, C.woodDark);
  kit.window(-1.0, 1.2, 1.55, 0.7, 0.6);
  kit.box(1.9, 0, -0.9, 0.18, 2.4, 0.18, C.woodDark);                 // bastidor
  kit.box(1.9, 0, 0.9, 0.18, 2.4, 0.18, C.woodDark);
  kit.box(1.9, 2.3, 0, 0.18, 0.18, 2.0, C.woodDark);
  for (let i = 0; i < 3; i++) {                                        // troncos
    const y = 0.2 + i * 0.34;
    const z = -1.2 + i * 0.75;
    kit.cyl(-2.6, y, z, 0.3, 0.3, 2.2, C.wood, 0, 8);
    kit.box(-2.6, y, z, 0.34, 0.34, 2.3, C.woodLight);
  }
  for (let i = 0; i < 3; i++) kit.box(0.6, 0.1 + i * 0.16, -2.2, 2.4, 0.16, 0.9, C.woodLight);
  kit.cone(2.6, 0, -2.2, 0.8, 0.5, C.woodLight, 0, 8);
  kit.part('spin', 'cylLow', { color: 0xd8dde4, metalness: 0.85, roughness: 0.25 }, {
    x: 1.9, y: 1.5, z: 0, sx: 2.6, sy: 0.16, sz: 2.6, rz: Math.PI / 2, axis: 'x',
  });
  kit.part('spin', 'torus', { color: C.metal, metalness: 0.8 }, {
    x: 1.9, y: 1.5, z: 0, sx: 0.9, sy: 0.9, sz: 0.3, rz: Math.PI / 2,
  });
}

function mine(kit, pal) {
  kit.cone(-1.7, 0, -0.4, 2.9, 2.7, C.rockDark, 0, 7);                 // montaña
  kit.box(-1.7, 0.1, 1.0, 1.5, 1.5, 1.0, 0x1a1712);                    // boca del túnel
  kit.box(0.9, 0, 0.4, 2.4, 1.6, 2.2, C.dark);                        // nave
  kit.box(0.9, 1.6, 0.4, 2.6, 0.18, 2.4, pal.stoneDark);
  for (const [lx, lz] of [[-0.6, -0.9], [0.6, -0.9], [-0.6, 0.9], [0.6, 0.9]]) {
    kit.box(2.9 + lx, 0, -1.6 + lz * 0.4, 0.14, 3.4, 0.14, C.woodDark); // castillete
  }
  kit.box(2.9, 3.2, -1.6, 1.6, 0.16, 0.9, C.woodDark);
  kit.part('spin', 'torus', { color: C.metal, metalness: 0.8 }, {
    x: 2.9, y: 2.9, z: -1.6, sx: 1.1, sy: 1.1, sz: 0.3, axis: 'z',
  });
  kit.box(0, 0.06, 2.2, 5.4, 0.08, 0.16, C.metal);                     // vía
  kit.box(0, 0.06, 2.9, 5.4, 0.08, 0.16, C.metal);
  for (let i = -2; i <= 2; i++) kit.box(i * 1.2, 0.02, 2.55, 0.4, 0.1, 1.0, C.woodDark);
  kit.part('cart', 'box', { color: C.rust, metalness: 0.5, roughness: 0.6 }, {
    x: 0, y: 0.4, z: 2.55, sx: 0.9, sy: 0.6, sz: 0.8, amp: 1.8,
  });
  kit.dodeca(-2.9, 0.25, 2.2, 0.45, C.ore);                            // montón de mineral
  kit.dodeca(-2.3, 0.2, 2.6, 0.32, C.ore);
  kit.cyl(1.6, 0, -2.4, 0.06, 0.08, 1.4, C.dark, 0, 6);                // candil
  kit.sphere(1.6, 1.5, -2.4, 0.13, pal.glowWarm);
}

function plant(kit, pal) {
  kit.cyl(0, 0, 0, 2.7, 2.9, 0.28, pal.stoneDark, 0, 12);
  kit.cyl(0, 0.28, 0, 1.6, 1.9, 2.0, pal.stone);
  kit.cyl(0, 2.28, 0, 1.2, 1.5, 0.3, C.dark, 0, 12);
  kit.dome(0, 2.58, 0, 1.2, pal.trim);
  kit.part('pulse', 'sphere', {
    color: pal.glowCyan, emissive: pal.glowCyan, emissiveIntensity: 1.7, roughness: 0.25,
  }, { x: 0, y: 3.1, z: 0 });
  for (const cx of [-2.0, 2.0]) {                                      // torres de refrigeración
    kit.taper(cx, 0.28, -1.4, 0.85, 1.15, 3.0, pal.stone);
    kit.torus(cx, 3.28, -1.4, 0.8, 0.14, pal.stoneDark, Math.PI / 2);
  }
  for (let i = 0; i < 3; i++) {                                        // placas solares
    kit.box(-2.2 + i * 1.5, 0.5, 2.3, 1.2, 0.08, 1.5, 0x1b2a4a, -0.42);
    kit.cyl(-2.2 + i * 1.5, 0.28, 2.9, 0.06, 0.06, 0.5, C.dark, 0, 6);
  }
  for (const [lx, lz] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) {
    kit.box(2.9 + lx, 0.28, 1.9 + lz, 0.1, 3.0, 0.1, C.metal);         // torre eléctrica
  }
  kit.box(2.9, 2.4, 1.9, 1.2, 0.1, 0.1, C.metal);
  kit.box(2.9, 1.5, 1.9, 0.9, 0.1, 0.1, C.metal);
  kit.box(0, 1.05, 1.95, 1.6, 0.14, 0.07, 0xffd000);                   // señal
}

function barracks(kit, pal) {
  kit.box(0, 0, -0.3, 5.4, 1.9, 3.2, pal.stone);
  kit.roof(0, 1.9, -0.3, 5.8, 1.1, 3.6, pal.roof);
  kit.box(0, 0, 1.35, 1.0, 1.3, 0.14, C.woodDark);
  kit.window(-1.8, 1.0, 1.35, 0.8, 0.6);
  kit.window(1.8, 1.0, 1.35, 0.8, 0.6);
  kit.part('flag', 'cylLow', { color: C.dark, metalness: 0.5 }, { x: 2.6, y: 2.0, z: 2.4, sy: 4.0 });
  kit.part('flag', 'box', { color: C.red, roughness: 0.8 }, {
    x: 3.25, y: 3.4, z: 2.4, sx: 1.25, sy: 0.75, sz: 0.07,
  });
  for (let i = -2; i <= 2; i++) {                                      // sacos de arena
    kit.box(i * 1.0, 0.35, 2.5, 0.9, 0.42, 0.6, C.sand, i * 0.05);
    kit.box(i * 1.0, 0.76, 2.5, 0.8, 0.4, 0.55, shade(C.sand, -0.12), i * 0.04);
  }
  for (let i = 0; i < 3; i++) {                                        // rastrillera
    kit.box(-2.4, 0.6, -1.4 - i * 0.5, 0.08, 1.2, 0.08, C.woodDark, 0.2);
    kit.box(-2.4, 0.95, -1.5 - i * 0.5, 0.5, 0.08, 0.08, C.metal, 0.2);
  }
  kit.cyl(2.4, 0, -1.6, 0.1, 0.1, 1.5, C.woodDark, 0, 6);              // muñeco de entrenamiento
  kit.box(2.4, 1.2, -1.6, 0.9, 0.1, 0.1, C.woodDark);
  kit.sphere(2.4, 1.55, -1.6, 0.2, C.sand);
}

function turret(kit, pal) {
  kit.cyl(0, 0, 0, 1.7, 1.9, 0.4, pal.stoneDark, 0, 10);
  kit.torus(0, 0.4, 0, 1.6, 0.16, pal.stone, Math.PI / 2);
  kit.cyl(0, 0.4, 0, 1.25, 1.5, 0.7, C.dark, 0, 10);
  kit.part('turretHead', 'box', { color: pal.stone, metalness: 0.35, roughness: 0.5 }, {
    x: 0, y: 1.25, z: 0, sx: 1.5, sy: 0.85, sz: 1.5,
  });
  for (const bx of [-0.35, 0.35]) {
    kit.part('child', 'cylLow', { color: C.metal, metalness: 0.85 }, {
      x: bx, y: 0.15, z: 1.3, sx: 0.24, sy: 2.2, sz: 0.24, rx: Math.PI / 2, parent: 'turretHead',
    });
  }
  kit.box(-2.2, 0.2, 1.6, 0.8, 0.4, 0.6, C.sand);
  kit.box(2.2, 0.2, 1.6, 0.8, 0.4, 0.6, C.sand);
  kit.box(2.3, 0, -1.9, 0.6, 0.5, 0.6, C.rust);
  kit.box(2.3, 0.5, -1.9, 0.5, 0.45, 0.5, C.wood);
}

function workshop(kit, pal) {
  kit.box(0, 0, 0, 5.2, 2.2, 3.6, pal.stone);
  for (let i = 0; i < 3; i++) {                                        // cubierta en diente de sierra
    kit.box(0, 2.2 + i * 0.42, 0, 5.2 - i * 0.5, 0.42, 3.6 - i * 0.4, pal.roof);
  }
  kit.taper(1.7, 2.2, -1.2, 0.34, 0.44, 3.0, C.dark);
  kit.box(0, 0, 1.85, 1.1, 1.3, 0.14, C.woodDark);
  kit.window(-1.7, 1.1, 1.85, 0.9, 0.7);
  kit.window(1.7, 1.1, 1.85, 0.9, 0.7);
  kit.part('spin', 'torus', { color: C.ore, metalness: 0.75, roughness: 0.3 }, {
    x: -3.0, y: 1.4, z: 1.2, sx: 1.5, sy: 1.5, sz: 0.5, axis: 'z',
  });
  kit.part('spin', 'torus', { color: C.ore, metalness: 0.75, roughness: 0.3 }, {
    x: -2.1, y: 1.0, z: 1.2, sx: 0.9, sy: 0.9, sz: 0.4, axis: 'z', speed: -1.4,
  });
  kit.box(-0.2, 0.3, -2.4, 3.4, 0.14, 0.9, C.dark);                    // cinta
  kit.part('cart', 'box', { color: C.wood, roughness: 0.9 }, {
    x: 0, y: 0.6, z: -2.4, sx: 0.6, sy: 0.5, sz: 0.7,
  });
  kit.cyl(-2.6, 1.6, -0.6, 0.14, 0.14, 2.4, C.metal, Math.PI / 2, 8);  // tubería
  kit.sphere(-2.6, 1.9, 0.6, 0.22, pal.glowCyan);
}

function lab(kit, pal) {
  kit.box(0, 0, 0, 4.6, 1.7, 4.2, C.white);
  kit.box(0, 1.7, 0, 4.8, 0.2, 4.4, pal.trim);
  kit.box(0, 0, 2.15, 1.2, 1.2, 0.14, C.dark);
  kit.window(-1.5, 0.95, 2.15, 0.9, 0.6, pal.glowCyan);
  kit.window(1.5, 0.95, 2.15, 0.9, 0.6, pal.glowCyan);
  kit.part('static', 'halfSphere', {
    color: 0x9fd8ff, emissive: 0x224a66, emissiveIntensity: 0.8,
    transparent: true, opacity: 0.5, roughness: 0.15, metalness: 0.1,
  }, { x: 0, y: 1.9, z: 0, s: 3.6 });
  kit.cyl(1.7, 1.9, 1.7, 0.06, 0.08, 2.6, C.dark, 0, 6);
  kit.part('blink', 'sphere', {
    color: 0xff5a5a, emissive: 0xff5a5a, emissiveIntensity: 1.8, roughness: 0.3,
  }, { x: 1.7, y: 4.6, z: 1.7 });
  kit.part('spin', 'halfSphere', { color: C.white, roughness: 0.5, metalness: 0.2 }, {
    x: -2.0, y: 2.7, z: -1.2, sx: 1.6, sy: 1.6, sz: 1.6, rx: -0.7,
  });
  kit.cyl(-2.0, 1.9, -1.2, 0.07, 0.07, 0.9, C.dark, 0, 6);
  kit.part('spin', 'torus', {
    color: pal.glowCyan, emissive: pal.glowCyan, emissiveIntensity: 1.4,
    transparent: true, opacity: 0.6, depthWrite: false,
  }, { x: 0, y: 2.7, z: 0, sx: 2.2, sy: 2.2, sz: 0.12, rx: Math.PI / 2, speed: -0.8 });
}

function spaceport(kit, pal) {
  kit.cyl(0, 0, 0, 4.1, 4.3, 0.26, 0x4a5158, 0, 20);
  kit.torus(0, 0.26, 0, 3.0, 0.1, pal.trim, Math.PI / 2);
  kit.torus(0, 0.26, 0, 1.5, 0.08, C.dark, Math.PI / 2);
  kit.cyl(0, 0.26, 0, 0.85, 0.95, 1.8, 0xe6ebf2);
  kit.cone(0, 2.06, 0, 0.85, 2.2, 0xe6ebf2, 0, 12);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    kit.box(Math.cos(a) * 0.85, 0.26, Math.sin(a) * 0.85, 0.12, 1.3, 0.7, C.red, -a);
  }
  kit.part('pulse', 'cone', {
    color: 0xffb04d, emissive: 0xff8a2b, emissiveIntensity: 1.6, transparent: true, opacity: 0.85,
  }, { x: 0, y: 0.9, z: 0, sx: 1.2, sy: 1.8, sz: 1.2, rx: Math.PI });
  for (const [lx, lz] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) {
    kit.box(3.0 + lx, 0.26, lz, 0.12, 5.4, 0.12, C.metal);             // torre de servicio
  }
  for (let i = 0; i < 4; i++) kit.box(2.6, 1.2 + i * 1.2, 0, 1.0, 0.1, 0.1, C.metal);
  kit.box(3.0, 5.7, 0, 0.8, 0.12, 0.12, C.metal);
  kit.sphere(-3.0, 0.9, 2.2, 0.85, C.white);                           // depósito
  kit.sphere(-3.0, 0.9, 2.2, 0.5, C.dark);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    kit.part('blink', 'sphere', {
      color: 0x39ff7a, emissive: 0x39ff7a, emissiveIntensity: 1.8, roughness: 0.3,
    }, { x: Math.cos(a) * 3.6, y: 0.5, z: Math.sin(a) * 3.6, s: 0.4 });
  }
}

const RECIPES = {
  center, house, farm, sawmill, mine, plant, barracks, turret, workshop, lab, spaceport,
};

/**
 * Construye la malla de un edificio (una geometría fusionada + piezas animadas).
 * @returns {{solid: THREE.BufferGeometry|null, parts: Array, height: number}}
 */
export function buildStructure(type, assets, theme, lowres = false) {
  const pal = palette(theme);
  const kit = new Kit(assets, pal, lowres);
  const recipe = RECIPES[type] || RECIPES.house;
  try {
    recipe(kit, pal);
  } catch (e) {
    console.warn('[Civ] Receta de edificio fallida:', type, e);
  }
  return { solid: kit.solid.merge(), parts: kit.loose, height: kit.maxY };
}

// ---------------------------------------------------------------- Yacimientos

/** Bosque: arbolitos con tronco y dos copas. */
export function buildForestNode(assets, theme) {
  const kit = new Kit(assets, palette(theme), false);
  const n = 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 1.0 + (i % 2) * 0.8;
    const h = 3.0 + (i % 3) * 0.5;
    kit.cyl(Math.cos(a) * r, 0, Math.sin(a) * r, 0.16, 0.24, h * 0.45, C.woodDark, 0, 6);
    kit.cone(Math.cos(a) * r, h * 0.3, Math.sin(a) * r, 1.15, h * 0.55, i % 2 ? C.leaf : 0x4fae57, 0, 7);
    kit.cone(Math.cos(a) * r, h * 0.6, Math.sin(a) * r, 0.85, h * 0.45, C.leafDark, 0, 7);
  }
  return { solid: kit.solid.merge(), parts: kit.loose, height: 4 };
}

/** Filón de mineral o piedra: rocas con vetas brillantes. */
export function buildVeinNode(assets, theme, resource = 'metal') {
  const kit = new Kit(assets, palette(theme), false);
  const oreColor = resource === 'stone' ? C.rock : C.ore;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const r = 0.8 + (i % 2) * 0.9;
    const s = 0.7 + (i % 3) * 0.25;
    kit.dodeca(Math.cos(a) * r, s * 0.55, Math.sin(a) * r, s, i % 2 ? C.rock : C.rockDark, a);
    kit.octa(Math.cos(a) * r + 0.25, s * 0.95, Math.sin(a) * r - 0.2, 0.22, oreColor, a);
  }
  return { solid: kit.solid.merge(), parts: kit.loose, height: 1.8 };
}

/** Filón de cristal: esquinas emisivas que laten. */
export function buildCrystalNode(assets, theme) {
  const kit = new Kit(assets, palette(theme), false);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const r = 0.7 + (i % 2) * 0.9;
    const h = 1.4 + (i % 3) * 0.7;
    kit.octa(Math.cos(a) * r, h * 0.5, Math.sin(a) * r, h * 0.5, C.crystal, a);
    kit.part('pulse', 'octa', {
      color: C.crystal, emissive: 0x880066, emissiveIntensity: 1.2,
      transparent: true, opacity: 0.75,
    }, { x: Math.cos(a) * r, y: h * 0.9, z: Math.sin(a) * r, s: 0.35 });
  }
  return { solid: kit.solid.merge(), parts: kit.loose, height: 3.2 };
}

/** Decoración del terreno fuera de la ciudad: rocas, matas y cristales. */
export function buildScatter(assets, theme, count = 26) {
  const kit = new Kit(assets, palette(theme), true);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 34 + Math.random() * 16;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const kind = Math.random();
    if (kind < 0.45) {
      const s = 0.3 + Math.random() * 0.5;
      kit.dodeca(x, s * 0.5, z, s, Math.random() < 0.5 ? C.rock : C.rockDark, a);
    } else if (kind < 0.8) {
      kit.cone(x, 0, z, 0.28, 0.5 + Math.random() * 0.3, C.leaf, a, 5);
      kit.cone(x, 0.3, z, 0.22, 0.4, C.leafDark, a, 5);
    } else {
      kit.octa(x, 0.35, z, 0.35, C.crystal, a);
    }
  }
  return kit.solid.merge();
}
