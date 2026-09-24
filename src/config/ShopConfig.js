/**
 * Catálogo del Taxi-Mercader (B90, "El quinto elemento").
 * Precios en créditos (CR). Los créditos se ganan depositando basura,
 * derribando OVNIs, destruyendo asteroides y reparando refinerías.
 */
export const WEAPONS = {
  laser: {
    id: 'laser', name: 'Láser', short: 'LÁSER', icon: '🔹', key: '1',
    speed: 115, damage: 25, cadence: 150, color: 0x00f0ff, life: 1.5, radius: 0.9,
  },
  plasma: {
    id: 'plasma', name: 'Plasma', short: 'PLASMA', icon: '🟣', key: '2',
    speed: 62, damage: 60, cadence: 380, color: 0xff33ff, life: 2.4, radius: 1.3, splash: 3.5,
  },
  scatter: {
    id: 'scatter', name: 'Dispersor', short: 'DISPERSOR', icon: '💥', key: '3',
    speed: 95, damage: 16, pellets: 6, spread: 0.075, cadence: 560, color: 0xffaa33, life: 0.95, radius: 1.0,
  },
  missile: {
    id: 'missile', name: 'Misiles', short: 'MISILES', icon: '🚀', key: '4',
    speed: 40, maxSpeed: 80, damage: 130, cadence: 650, color: 0xffe600, life: 4, radius: 1.6, homing: 3.2, splash: 7,
  },
};

export const WEAPON_ORDER = ['laser', 'plasma', 'scatter', 'missile'];

export const MAX_AMMO = { plasma: 150, missile: 40 };

export const SHOP_ITEMS = [
  // ---------------------------------------------------------------- ARMAS
  {
    id: 'plasma_ammo', category: 'weapons', icon: '🟣', name: 'Munición de plasma',
    desc: '+25 cargas de plasma (máx. 150). Daño alto, rompe la basura en trozos.',
    price: 40, consumable: true,
    canBuy: (w) => (w.ammo.plasma < MAX_AMMO.plasma) || 'Munición de plasma al máximo',
    apply: (w) => { w.ammo.plasma = Math.min(MAX_AMMO.plasma, w.ammo.plasma + 25); },
  },
  {
    id: 'scatter', category: 'weapons', icon: '💥', name: 'Dispersor de chatarra',
    desc: 'Escopeta de 6 perdigones con munición infinita. Ideal contra lluvias de asteroides.',
    price: 180, unlock: 'scatter',
  },
  {
    id: 'missile', category: 'weapons', icon: '🚀', name: 'Lanzamisiles buscadores',
    desc: 'Misiles que persiguen OVNIs y asteroides con daño en área. Incluye 8 misiles.',
    price: 320, unlock: 'missile',
    onUnlock: (w) => { w.ammo.missile = Math.min(MAX_AMMO.missile, (w.ammo.missile || 0) + 8); },
  },
  {
    id: 'missile_ammo', category: 'weapons', icon: '🎯', name: 'Pack de misiles ×6',
    desc: '+6 misiles buscadores (máx. 40).',
    price: 70, consumable: true, requires: 'missile',
    canBuy: (w) => (w.ammo.missile < MAX_AMMO.missile) || 'Misiles al máximo',
    apply: (w) => { w.ammo.missile = Math.min(MAX_AMMO.missile, w.ammo.missile + 6); },
  },
  {
    id: 'laser', category: 'weapons', icon: '🔹', name: 'Láser potenciado',
    desc: '+35% de daño y +10% de cadencia por nivel.',
    prices: [120, 240, 400], upgrade: 'laser',
  },
  // -------------------------------------------------------------- MEJORAS
  {
    id: 'engine', category: 'upgrades', icon: '⚙️', name: 'Motor iónico',
    desc: '+15% de velocidad máxima y aceleración por nivel.',
    prices: [100, 200, 350], upgrade: 'engine',
  },
  {
    id: 'armor', category: 'upgrades', icon: '🛡️', name: 'Blindaje reforzado',
    desc: '+25 de integridad máxima por nivel.',
    prices: [120, 240, 380], upgrade: 'armor',
  },
  {
    id: 'cargo', category: 'upgrades', icon: '📦', name: 'Compactador de carga',
    desc: '+25 de capacidad de basura por nivel.',
    prices: [90, 180, 300], upgrade: 'cargo',
  },
  {
    id: 'magnet', category: 'upgrades', icon: '🧲', name: 'Imán de recolección',
    desc: 'Atrae basura y gotas de agua desde más lejos y amplía el radio de recogida.',
    prices: [80, 160, 280], upgrade: 'magnet',
  },
  {
    id: 'repair', category: 'upgrades', icon: '🔧', name: 'Soldador rápido',
    desc: '+60% de velocidad al reparar refinerías por nivel.',
    prices: [100, 220], upgrade: 'repair',
  },
  {
    id: 'heal', category: 'upgrades', icon: '❤️', name: 'Reparar a WALL·E',
    desc: 'Restaura toda la integridad de WALL·E.',
    price: 35, consumable: true,
    canBuy: (w) => (w.health < w.maxHealth - 0.5) || 'Integridad al máximo',
    apply: (w) => { w.health = w.maxHealth; },
  },
];

/** Estado de un artículo para un jugador concreto. */
export function getItemState(item, w) {
  const state = { level: 0, maxLevel: 1, price: item.price || 0, maxed: false, locked: false, reason: '' };
  if (item.upgrade) {
    state.level = w.upgrades[item.upgrade] || 0;
    state.maxLevel = item.prices.length;
    state.maxed = state.level >= state.maxLevel;
    state.price = state.maxed ? 0 : item.prices[state.level];
    if (state.maxed) state.reason = 'Nivel máximo';
  } else if (item.unlock) {
    state.maxed = w.weapons.includes(item.unlock);
    state.level = state.maxed ? 1 : 0;
    if (state.maxed) state.reason = 'Ya equipado';
  }
  if (item.requires && !w.weapons.includes(item.requires)) {
    state.locked = true;
    state.reason = 'Requiere el lanzamisiles';
  }
  if (!state.maxed && !state.locked && item.canBuy) {
    const r = item.canBuy(w);
    if (r !== true) { state.locked = true; state.reason = typeof r === 'string' ? r : 'No disponible'; }
  }
  state.affordable = w.credits >= state.price;
  state.canPurchase = !state.maxed && !state.locked && state.affordable;
  if (!state.maxed && !state.locked && !state.affordable) state.reason = `Faltan ${state.price - w.credits} CR`;
  return state;
}

/** Compra un artículo. Devuelve { ok, message }. */
export function buyItem(item, w) {
  const st = getItemState(item, w);
  if (!st.canPurchase) return { ok: false, message: st.reason || 'No se puede comprar' };
  w.credits -= st.price;
  if (item.upgrade) {
    w.upgrades[item.upgrade] = (w.upgrades[item.upgrade] || 0) + 1;
    if (w.applyUpgrades) w.applyUpgrades();
    return { ok: true, message: `${item.name} nivel ${w.upgrades[item.upgrade]}` };
  }
  if (item.unlock) {
    if (!w.weapons.includes(item.unlock)) w.weapons.push(item.unlock);
    if (item.onUnlock) item.onUnlock(w);
    return { ok: true, message: `¡${item.name} desbloqueado! Selecciónalo con 🔄 o su tecla` };
  }
  if (item.apply) item.apply(w);
  return { ok: true, message: `${item.name} comprado` };
}
