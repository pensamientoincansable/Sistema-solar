/**
 * Configuración del Sistema Solar - Datos reales escalados para gameplay
 * Texturas del repositorio se mapean aquí
 */
export const PLANETS_CONFIG = [
  {
    id: 'mercury',
    name: 'Mercurio',
    emoji: '☿️',
    texture: 'textures/mercury_baseColor.jpeg',
    radius: 2.4,
    distance: 28,
    initialAngle: 0.8, // fase orbital inicial (rad) para que no empiecen alineados
    orbitSpeed: 0.008,
    rotationSpeed: 0.01,
    color: 0xaaaaaa,
    trashType: 'metálico',
    trashRichness: 0.8,
    civilization: {
      name: 'Forja Solar',
      description: 'Ciudad espejo resistente al calor extremo',
      requiredMaterials: { metal: 80, energy: 100, glass: 40 },
      bonus: 'Paneles solares +200% energía'
    },
    environment: { temp: 167, gravity: 0.38, hazard: 'Radiación solar' }
  },
  {
    id: 'venus',
    name: 'Venus',
    emoji: '♀️',
    texture: 'textures/venus_baseColor.jpeg',
    radius: 4.8,
    distance: 42,
    initialAngle: 2.4, // fase orbital inicial (rad) para que no empiecen alineados
    orbitSpeed: 0.006,
    rotationSpeed: 0.005,
    color: 0xe6c229,
    trashType: 'ácido',
    trashRichness: 0.6,
    civilization: {
      name: 'Aerópolis',
      description: 'Ciudades flotantes sobre nubes ácidas',
      requiredMaterials: { polymer: 100, metal: 60, gas: 80 },
      bonus: 'Extracción atmosférica'
    },
    environment: { temp: 464, gravity: 0.91, hazard: 'Presión aplastante' }
  },
  {
    id: 'earth',
    name: 'Tierra',
    emoji: '🌍',
    texture: 'textures/earth_baseColor.jpeg',
    radius: 5.0,
    distance: 60,
    initialAngle: 4.2, // fase orbital inicial (rad) para que no empiecen alineados
    orbitSpeed: 0.0045,
    rotationSpeed: 0.02,
    color: 0x2b65ec,
    trashType: 'orgánico-tech',
    trashRichness: 1.0,
    hasMoon: true,
    moonTexture: 'textures/moon_baseColor.jpeg',
    civilization: {
      name: 'Neo-Terra',
      description: 'Arcologías verdes autosostenibles',
      requiredMaterials: { bio: 100, metal: 50, water: 80 },
      bonus: 'Terraformación +50% eficiencia'
    },
    environment: { temp: 15, gravity: 1.0, hazard: 'Basura orbital densa' }
  },
  {
    id: 'mars',
    name: 'Marte',
    emoji: '♂️',
    texture: 'textures/mars_baseColor.jpeg',
    radius: 3.5,
    distance: 80,
    initialAngle: 5.6, // fase orbital inicial (rad) para que no empiecen alineados
    orbitSpeed: 0.0035,
    rotationSpeed: 0.018,
    color: 0xc1440e,
    trashType: 'óxido',
    trashRichness: 0.9,
    civilization: {
      name: 'Ares Dome',
      description: 'Cúpulas presurizadas bajo regolito',
      requiredMaterials: { metal: 120, glass: 80, concrete: 60 },
      bonus: 'Minería autónoma'
    },
    environment: { temp: -65, gravity: 0.38, hazard: 'Tormentas de polvo' }
  },
  {
    id: 'jupiter',
    name: 'Júpiter',
    emoji: '♃',
    texture: 'textures/jupiter_baseColor.jpeg',
    radius: 18,
    distance: 120,
    initialAngle: 1.5, // fase orbital inicial (rad) para que no empiecen alineados
    orbitSpeed: 0.0015,
    rotationSpeed: 0.04,
    color: 0xd8ca9d,
    trashType: 'gigante',
    trashRichness: 1.2,
    civilization: {
      name: 'Estación Jovian',
      description: 'Plataformas magnéticas en atmósfera',
      requiredMaterials: { gas: 150, metal: 100, energy: 120 },
      bonus: 'Energía de fusión ilimitada'
    },
    environment: { temp: -110, gravity: 2.5, hazard: 'Radiación letal' }
  },
  {
    id: 'saturn',
    name: 'Saturno',
    emoji: '♄',
    texture: 'textures/saturn_baseColor.jpeg',
    ringTexture: 'textures/saturn_ring_baseColor.png',
    radius: 14,
    distance: 165,
    initialAngle: 3.3, // fase orbital inicial (rad) para que no empiecen alineados
    orbitSpeed: 0.001,
    rotationSpeed: 0.035,
    color: 0xf7dc6f,
    trashType: 'anillos',
    trashRichness: 1.1,
    hasRings: true,
    civilization: {
      name: 'Anillo Habitat',
      description: 'Ciudades anulares giratorias',
      requiredMaterials: { ice: 100, metal: 90, polymer: 70 },
      bonus: 'Gravedad artificial'
    },
    environment: { temp: -140, gravity: 1.06, hazard: 'Anillos inestables' }
  },
  {
    id: 'uranus',
    name: 'Urano',
    emoji: '♅',
    texture: 'textures/uranus_baseColor.jpeg',
    radius: 10,
    distance: 205,
    initialAngle: 0.3, // fase orbital inicial (rad) para que no empiecen alineados
    orbitSpeed: 0.0007,
    rotationSpeed: 0.025,
    color: 0x43b0f1,
    trashType: 'criogénico',
    trashRichness: 0.7,
    civilization: {
      name: 'Cryo Vault',
      description: 'Bóvedas cuánticas en hielo',
      requiredMaterials: { ice: 120, energy: 90, crystal: 60 },
      bonus: 'Computación cuántica'
    },
    environment: { temp: -195, gravity: 0.89, hazard: 'Vientos supersónicos' }
  },
  {
    id: 'neptune',
    name: 'Neptuno',
    emoji: '♆',
    texture: 'textures/neptune_baseColor.jpeg',
    radius: 9.5,
    distance: 240,
    initialAngle: 2.9, // fase orbital inicial (rad) para que no empiecen alineados
    orbitSpeed: 0.0005,
    rotationSpeed: 0.03,
    color: 0x2e68f7,
    trashType: 'oscuro',
    trashRichness: 0.75,
    civilization: {
      name: 'Abismo Azul',
      description: 'Estaciones de aguas profundas',
      requiredMaterials: { water: 130, crystal: 80, gas: 70 },
      bonus: 'Detección materia oscura'
    },
    environment: { temp: -200, gravity: 1.14, hazard: 'Presión oceánica' }
  }
];

export const MATERIALS = {
  metal: { name: 'Metal', color: '#a0a0a0', icon: '🔩' },
  polymer: { name: 'Polímero', color: '#ff6b6b', icon: '🧪' },
  glass: { name: 'Cristal', color: '#7fdbff', icon: '🔷' },
  energy: { name: 'Energía', color: '#ffe600', icon: '⚡' },
  bio: { name: 'Biomasa', color: '#2ecc40', icon: '🌱' },
  water: { name: 'Agua', color: '#0074d9', icon: '💧' },
  gas: { name: 'Gas', color: '#b10dc9', icon: '🌫️' },
  ice: { name: 'Hielo', color: '#c0f0ff', icon: '🧊' },
  crystal: { name: 'Cristal Cuántico', color: '#ff00ff', icon: '💎' },
  concrete: { name: 'Hormigón', color: '#888', icon: '🏗️' }
};

export const TRASH_TYPES = [
  { id: 'satellite', model: 'cube', scale: 1.2, value: 10, material: 'metal', color: 0x888888 },
  { id: 'panel', model: 'plane', scale: 1.5, value: 15, material: 'energy', color: 0x2222aa },
  { id: 'rocket', model: 'cylinder', scale: 2.0, value: 25, material: 'metal', color: 0xdddddd },
  { id: 'organic', model: 'sphere', scale: 0.8, value: 8, material: 'bio', color: 0x44aa44 },
  { id: 'crystal', model: 'octahedron', scale: 1.0, value: 30, material: 'crystal', color: 0xff00ff },
  { id: 'ice', model: 'icosahedron', scale: 1.3, value: 12, material: 'ice', color: 0xa0e0ff }
];

export const ENEMY_TYPES = [
  { id: 'drone', speed: 12, health: 40, damage: 10, color: 0xff3333, scale: 1.0, loot: 5 },
  { id: 'pirate', speed: 8, health: 80, damage: 20, color: 0xff8800, scale: 1.5, loot: 15 },
  { id: 'mothership', speed: 4, health: 200, damage: 35, color: 0xaa00ff, scale: 3.0, loot: 50 }
];
