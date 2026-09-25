/**
 * CivConfig - Datos del modo "Civilizar" (inspirado en Rise of Nations / Civilization).
 *
 * Todo el balance vive aquí: recursos, edificios, unidades, eras y el aspecto
 * de cada planeta. El módulo NO importa three.js: la simulación (Colony.js) es
 * lógica pura y por eso se puede guardar/cargar y probar sin navegador.
 */

/** Recursos propios de una colonia (los de MATERIALS se reutilizan en la órbita). */
export const CIV_RESOURCES = ['food', 'wood', 'stone', 'metal', 'energy', 'crystal', 'knowledge'];

/** Recursos que se ven en la barra superior de la colonia. */
export const CIV_BAR = ['food', 'wood', 'stone', 'metal', 'energy', 'crystal', 'knowledge'];

/** Rejilla de construcción del asentamiento (tiles cuadrados de TILE unidades). */
export const GRID = 13;
export const TILE = 6.5;
/** Radio útil del asentamiento: fuera de él no se puede construir. */
export const CITY_RADIUS = (GRID * TILE) / 2 - 2;

/** Tamaño del terreno visible (radio del disco). */
export const TERRAIN_RADIUS = CITY_RADIUS + 16;

/**
 * Prioridades de reparto de ciudadanos (como los deslizadores de Rise of
 * Nations): 0 = no dedicar a nadie, 10 = máxima prioridad.
 */
export const PRIORITIES = {
  food: { key: 'food', name: 'Alimento', icon: '🌾', default: 6 },
  wood: { key: 'wood', name: 'Madera', icon: '🪵', default: 5 },
  mineral: { key: 'mineral', name: 'Mineral', icon: '⛏️', default: 6 },
  build: { key: 'build', name: 'Construcción', icon: '🏗️', default: 7 },
  defense: { key: 'defense', name: 'Defensa', icon: '🛡️', default: 4 },
  research: { key: 'research', name: 'Investigación', icon: '🔬', default: 4 },
};

/**
 * Órdenes manuales: a qué puede mandar el jugador a un colono seleccionado.
 * `source` indica qué necesita la colonia para esa orden:
 *   farm     -> una granja terminada (los cultivos)
 *   forest   -> un bosque (yacimiento de madera)
 *   vein     -> un filón de piedra o metal
 *   crystal  -> un filón de cristal (o un taller que lo refine)
 *   plant    -> una planta de energía
 * `role` es el papel que adopta el colono mientras obedece.
 */
export const GATHER_TASKS = [
  { resource: 'food', name: 'Alimento', icon: '🌾', role: 'farmer', source: 'farm' },
  { resource: 'wood', name: 'Madera', icon: '🪵', role: 'logger', source: 'forest' },
  { resource: 'stone', name: 'Piedra', icon: '🪨', role: 'miner', source: 'vein' },
  { resource: 'metal', name: 'Metal', icon: '⛏️', role: 'miner', source: 'vein' },
  { resource: 'crystal', name: 'Cristal', icon: '💎', role: 'miner', source: 'crystal' },
  { resource: 'energy', name: 'Energía', icon: '⚡', role: 'miner', source: 'plant' },
];

export const GATHER_BY_RESOURCE = GATHER_TASKS.reduce((acc, t) => {
  acc[t.resource] = t;
  return acc;
}, {});

/** Texto de lo que falta para poder dar una orden (para la interfaz). */
export const GATHER_MISSING = {
  farm: 'Necesitas una granja 🌾 que alimente a los colonos',
  forest: 'No queda bosque cerca: construye una carpintería junto a los árboles',
  vein: 'No hay filón de ese material cerca de la colonia',
  crystal: 'No hay cristal cerca: construye un taller 🔧 para refinarlo',
  plant: 'Necesitas una planta de energía ⚡',
};

/** Qué prioridad alimenta a cada papel de trabajador. */
export const ROLE_PRIORITY = {
  farmer: 'food',
  logger: 'wood',
  miner: 'mineral',
  builder: 'build',
  guard: 'defense',
  scholar: 'research',
};

export const BUILDINGS = {
  center: {
    id: 'center', name: 'Ayuntamiento', icon: '🏛️', era: 0, max: 1,
    cost: {}, buildTime: 0, popCap: 4, workers: 0,
    desc: 'Sede de la colonia: entrena nuevos civiles y almacena los recursos.',
    role: null,
  },
  house: {
    id: 'house', name: 'Vivienda', icon: '🏠', era: 0, max: 10,
    cost: { wood: 40, stone: 20 }, buildTime: 6, popCap: 4, workers: 0,
    desc: '+4 de población máxima. Sin viviendas el ayuntamiento no puede crear más civiles.',
    role: null,
  },
  farm: {
    id: 'farm', name: 'Granja', icon: '🌾', era: 0, max: 8,
    cost: { wood: 55, stone: 15 }, buildTime: 8, popCap: 0, workers: 3,
    produces: { food: 0.55 }, role: 'farmer',
    desc: 'Alimenta a la colonia. Cada granjero produce alimento de forma continua.',
  },
  sawmill: {
    id: 'sawmill', name: 'Carpintería', icon: '🪚', era: 0, max: 6,
    cost: { stone: 35, metal: 15 }, buildTime: 8, popCap: 0, workers: 3,
    produces: { wood: 0.45 }, role: 'logger', needsNode: 'forest',
    desc: 'Los leñadores talan el bosque cercano. Hay que levantarla junto a los árboles.',
  },
  mine: {
    id: 'mine', name: 'Minería', icon: '⛏️', era: 0, max: 6,
    cost: { wood: 60, stone: 30 }, buildTime: 10, popCap: 0, workers: 3,
    produces: { metal: 0.4 }, role: 'miner', needsNode: 'vein',
    desc: 'Los mineros extraen mineral, piedra o cristal del filón más próximo.',
  },
  plant: {
    id: 'plant', name: 'Planta de energía', icon: '⚡', era: 1, max: 4,
    cost: { stone: 70, metal: 45 }, buildTime: 12, popCap: 0, workers: 2,
    produces: { energy: 0.5 }, role: 'miner',
    desc: 'Genera energía: necesaria para el taller, el laboratorio y el puerto espacial.',
  },
  barracks: {
    id: 'barracks', name: 'Cuartel', icon: '🪖', era: 1, max: 2,
    cost: { wood: 80, metal: 60 }, buildTime: 12, popCap: 0, workers: 0,
    guards: 3, guardCost: { food: 25, metal: 20 }, guardTime: 18,
    desc: 'Entrena guardias que repelen las incursiones (consumen población).',
  },
  turret: {
    id: 'turret', name: 'Torreta', icon: '🛡️', era: 1, max: 6,
    cost: { metal: 70, energy: 40 }, buildTime: 8, popCap: 0, workers: 0,
    defense: 14,
    desc: '+14 de defensa permanente contra incursiones.',
  },
  workshop: {
    id: 'workshop', name: 'Taller', icon: '🔧', era: 1, max: 3,
    cost: { wood: 90, metal: 70, stone: 40 }, buildTime: 14, popCap: 0, workers: 3,
    produces: { metal: 0.18, energy: 0.12 }, converts: { input: { metal: 0.3 }, output: { crystal: 0.12 } },
    role: 'builder',
    desc: 'Refina metal en cristal y genera créditos al exportar piezas.',
  },
  lab: {
    id: 'lab', name: 'Laboratorio', icon: '🔬', era: 2, max: 3,
    cost: { wood: 110, metal: 90, energy: 60 }, buildTime: 16, popCap: 0, workers: 2,
    produces: { knowledge: 0.22 }, role: 'scholar',
    desc: 'Los investigadores generan Conocimiento para avanzar de era.',
  },
  spaceport: {
    id: 'spaceport', name: 'Puerto espacial', icon: '🚀', era: 2, max: 1,
    cost: { metal: 220, energy: 150, crystal: 25 }, buildTime: 24, popCap: 2, workers: 1,
    role: 'builder',
    desc: 'Conecta la colonia con la órbita: permite enviar recursos a WALL·E (créditos y materiales).',
  },
};

/** Orden en el que se listan en el panel de construcción. */
export const BUILD_ORDER = ['center', 'house', 'farm', 'sawmill', 'mine', 'plant', 'barracks', 'turret', 'workshop', 'lab', 'spaceport'];

export const ERAS = [
  {
    id: 0, name: 'Asentamiento', icon: '⛺', cost: {}, knowledge: 0, bonus: 1,
    desc: 'Cuatro civiles, un ayuntamiento y poco más. Sobrevive y crece.',
  },
  {
    id: 1, name: 'Aldea', icon: '🏘️', cost: { food: 200, wood: 250, metal: 150 }, knowledge: 60, bonus: 1.15,
    desc: 'Energía, cuartel y torretas. Producción +15 %.',
  },
  {
    id: 2, name: 'Ciudad', icon: '🏙️', cost: { food: 500, metal: 500, energy: 300 }, knowledge: 220, bonus: 1.35,
    desc: 'Laboratorio y puerto espacial. Producción +35 %.',
  },
  {
    id: 3, name: 'Metrópolis espacial', icon: '🌆', cost: { metal: 1200, energy: 900, crystal: 120 }, knowledge: 600, bonus: 1.6,
    desc: 'Civilización plena: la colonia exporta sola a la órbita. Producción +60 %.',
  },
];

/** Papel de los peones: nombre, velocidad (u/s) y color del muñeco 3D. */
export const UNIT_TYPES = {
  citizen: { id: 'citizen', name: 'Colono', speed: 3.4, color: 0x9fd8ff, icon: '🧑' },
  builder: { id: 'builder', name: 'Constructor', speed: 3.6, color: 0xffc14d, icon: '👷' },
  farmer: { id: 'farmer', name: 'Granjero', speed: 3.2, color: 0x66d17a, icon: '🧑‍🌾' },
  logger: { id: 'logger', name: 'Leñador', speed: 3.2, color: 0xb98a4b, icon: '🪓' },
  miner: { id: 'miner', name: 'Minero', speed: 3.0, color: 0xcfd6e0, icon: '⛏️' },
  scholar: { id: 'scholar', name: 'Investigador', speed: 3.0, color: 0xc08bff, icon: '🔬' },
  guard: { id: 'guard', name: 'Guardia', speed: 4.0, color: 0xff6b6b, icon: '🛡️' },
};

/**
 * Vestimenta de cada papel: lo que se ve en el muñeco 3D.
 * `hat` = none | helmet | straw · `tool` = objeto que lleva en la mano.
 */
export const UNIT_LOOK = {
  citizen: { tunic: 0x9fd8ff, trousers: 0x3f4a58, hat: null, tool: null },
  builder: { tunic: 0xffc14d, trousers: 0x4a4136, hat: 'helmet', tool: 'hammer' },
  farmer: { tunic: 0x66d17a, trousers: 0x5b4a33, hat: 'straw', tool: 'hoe' },
  logger: { tunic: 0xb98a4b, trousers: 0x4d3a24, hat: null, tool: 'axe' },
  miner: { tunic: 0xcfd6e0, trousers: 0x3d444c, hat: 'helmet', tool: 'pickaxe' },
  scholar: { tunic: 0xc08bff, trousers: 0x39404d, hat: null, tool: 'tablet' },
  guard: { tunic: 0xff6b6b, trousers: 0x2f3540, hat: 'helmet', tool: 'rifle' },
};

/** Tonos de piel y de pelo: se reparten entre los civiles para que no sean clones. */
export const SKIN_TONES = [0xf6d5b8, 0xe8b98d, 0xc98d5f, 0x9c6640, 0x6f4526, 0xf0c3a0];
export const HAIR_TONES = [0x2b1d12, 0x4a2c17, 0x7a4a22, 0xb07a3a, 0xd8c07a, 0x8f8f96];

/** Balance general de la simulación. */
export const BALANCE = {
  startCitizens: 3,
  startBuilders: 1,
  startStorage: { food: 120, wood: 90, stone: 60, metal: 30, energy: 0, crystal: 0, knowledge: 0 },
  foodPerCitizen: 0.02,      // alimento consumido por ciudadano y segundo
  growthTime: 11,            // s entre nacimientos
  growthFood: 35,            // alimento que cuesta un nuevo colono
  carryMax: 6,               // carga visual de cada peón
  raidFirst: 100,            // s hasta la primera incursión
  raidMin: 95,
  raidMax: 170,
  raidDuration: 16,
  nodeRegen: 0.35,           // unidades de recurso que recupera un filón agotado por segundo
  exportRate: 0.5,           // fracción del almacén que se envía a la órbita
  // Ayuntamiento: creación manual de civiles (el límite lo suben las viviendas)
  trainTime: 6,              // s que tarda en llegar un nuevo civil
  trainFood: 30,             // alimento que cuesta
  // Recolección manual (seleccionar civiles y mandarlos a un recurso)
  manualRate: 1.15,          // recursos por segundo y colono en un yacimiento
  manualReach: 2.8,          // distancia al yacimiento a la que se cuenta trabajando
};

/**
 * Aspecto y nombre de los ciudadanos según el planeta (terrícolas, marcianos…).
 * `ground`/`rock`/`sky` tiñen el terreno y la luz local; `flora` decide si hay
 * árboles o formaciones de bio-domos.
 */
export const PLANET_CIV = {
  mercury: {
    demonym: 'Mercurianos', singular: 'mercuriano',
    ground: 0x8b8279, rock: 0x6d655c, sky: 0x1b120c, flora: 'crystal',
    nodes: { vein: 4, forest: 1, crystal: 1 },
    note: 'Llanura de regolito abrasada: la energía rinde más, la comida menos.',
    yields: { energy: 1.25, food: 0.75 },
  },
  venus: {
    demonym: 'Venusinos', singular: 'venusino',
    ground: 0x9c8b46, rock: 0x6f6331, sky: 0x3a2a08, flora: 'dome',
    nodes: { vein: 3, forest: 2, crystal: 1 },
    note: 'Nubes ácidas: la madera se obtiene de bio-domos presurizados.',
    yields: { wood: 1.2, metal: 0.85 },
  },
  earth: {
    demonym: 'Terrícolas', singular: 'terrícola',
    ground: 0x3f7a3a, rock: 0x77705f, sky: 0x1d4a72, flora: 'tree',
    nodes: { vein: 3, forest: 4, crystal: 1 },
    note: 'El hogar: bosques y agua abundantes, mineral justo.',
    yields: { food: 1.3, wood: 1.2 },
  },
  mars: {
    demonym: 'Marcianos', singular: 'marciano',
    ground: 0xa8522f, rock: 0x7d3a20, sky: 0x3a1608, flora: 'rock',
    nodes: { vein: 4, forest: 1, crystal: 2 },
    note: 'Desierto de hierro: mineral y cristal abundantes, agricultura bajo cúpula.',
    yields: { metal: 1.3, crystal: 1.2, food: 0.7 },
  },
  jupiter: {
    demonym: 'Jovianos', singular: 'joviano',
    ground: 0xb39b6d, rock: 0x8a7350, sky: 0x2b2110, flora: 'dome',
    nodes: { vein: 3, forest: 2, crystal: 2 },
    note: 'Plataformas flotantes en la atmósfera: gas y energía sin fin.',
    yields: { energy: 1.4, wood: 0.8 },
  },
  saturn: {
    demonym: 'Saturninos', singular: 'saturnino',
    ground: 0xc9b27e, rock: 0x9a875c, sky: 0x2a2410, flora: 'crystal',
    nodes: { vein: 3, forest: 2, crystal: 3 },
    note: 'Hábitats en los anillos: el hielo se funde en agua y cristal.',
    yields: { crystal: 1.3, food: 0.9 },
  },
  uranus: {
    demonym: 'Uranianos', singular: 'uraniano',
    ground: 0x6fa8c4, rock: 0x4d7f97, sky: 0x0f2b3a, flora: 'crystal',
    nodes: { vein: 3, forest: 2, crystal: 3 },
    note: 'Bóvedas de hielo cuántico: cristal y energía, poca comida.',
    yields: { crystal: 1.35, energy: 1.15, food: 0.7 },
  },
  neptune: {
    demonym: 'Neptunianos', singular: 'neptuniano',
    ground: 0x3f6bb5, rock: 0x2f4f88, sky: 0x08183a, flora: 'dome',
    nodes: { vein: 3, forest: 2, crystal: 3 },
    note: 'Estaciones abisales: agua y cristal a presión.',
    yields: { crystal: 1.3, food: 0.85 },
  },
};

export function planetCiv(planetId) {
  return PLANET_CIV[planetId] || PLANET_CIV.earth;
}

/** Multiplicador de producción de un recurso en un planeta concreto. */
export function yieldFactor(planetId, resource) {
  const theme = planetCiv(planetId);
  return (theme.yields && theme.yields[resource]) || 1;
}
