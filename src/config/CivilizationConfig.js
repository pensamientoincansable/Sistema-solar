/**
 * Reglas compartidas de acceso a las superficies y botín de asteroides.
 *
 * La civilización ya no se representa con una cúpula orbital: los materiales
 * desbloquean una visita a la superficie y, al entrar, CivMode crea la colonia
 * jugable. Mantener estas reglas fuera de la UI evita que el menú y el combate
 * calculen recompensas distintas.
 */
import { PLANETS_CONFIG } from './PlanetsConfig.js';

/** Cuanto mayor es el número, más difícil es encontrar el recurso en órbita. */
export const RESOURCE_SCARCITY = Object.freeze({
  bio: 10,
  glass: 9,
  polymer: 8,
  water: 7,
  crystal: 6,
  gas: 5,
  ice: 4,
  metal: 3,
  energy: 2,
  concrete: 1,
});

/** Multiplicadores pedidos para el botín de cada asteroide destruido. */
export const ASTEROID_LOOT_MULTIPLIERS = Object.freeze({
  target: 20,
  distant: 10,
  next: 5,
});

const planetById = (id) => PLANETS_CONFIG.find(p => p.id === id) || PLANETS_CONFIG.find(p => p.id === 'earth') || PLANETS_CONFIG[0];

function rarestRequirement(planet, used = new Set()) {
  if (!planet || !planet.civilization) return null;
  const entries = Object.entries(planet.civilization.requiredMaterials || {})
    .filter(([resource]) => !used.has(resource))
    .sort((a, b) => {
      const scarcity = (RESOURCE_SCARCITY[b[0]] || 0) - (RESOURCE_SCARCITY[a[0]] || 0);
      if (scarcity) return scarcity;
      // En empate, primero el que más unidades exige: también es más costoso
      return b[1] - a[1];
    });
  return entries.length ? entries[0][0] : null;
}

/**
 * Botín determinista de una oleada/asteroide según la refinería atacada.
 *
 * Cada asteroide libera tres paquetes: x20 del material más raro que necesita
 * el planeta objetivo, x10 del material raro del planeta más lejano y x5 del
 * siguiente planeta según distancia orbital. Se evita repetir un material para
 * que cada destrucción ayude a tres desbloqueos distintos.
 */
export function asteroidLootForPlanet(planetId) {
  const target = planetById(planetId);
  const used = new Set();
  const targetResource = rarestRequirement(target, used);
  const loot = [];

  if (targetResource) {
    used.add(targetResource);
    loot.push({
      resource: targetResource,
      amount: ASTEROID_LOOT_MULTIPLIERS.target,
      planetId: target.id,
      rank: 'target',
    });
  }

  const others = PLANETS_CONFIG
    .filter(p => p.id !== target.id)
    // Lo más distante se considera la siguiente dificultad logística.
    .sort((a, b) => (b.distance || 0) - (a.distance || 0));
  const multipliers = [ASTEROID_LOOT_MULTIPLIERS.distant, ASTEROID_LOOT_MULTIPLIERS.next];
  const usedPlanets = new Set([target.id]);
  for (const multiplier of multipliers) {
    let selected = null;
    for (const planet of others) {
      // x10 y x5 representan dos planetas diferentes, ordenados del más
      // lejano al siguiente; no son dos bolsas del mismo planeta distante.
      if (usedPlanets.has(planet.id)) continue;
      const resource = rarestRequirement(planet, used);
      if (resource) {
        selected = { planet, resource };
        break;
      }
    }
    if (!selected) break;
    used.add(selected.resource);
    usedPlanets.add(selected.planet.id);
    loot.push({
      resource: selected.resource,
      amount: multiplier,
      planetId: selected.planet.id,
      rank: multiplier === ASTEROID_LOOT_MULTIPLIERS.distant ? 'distant' : 'next',
    });
  }
  return loot;
}

/** Materiales de desbloqueo de un planeta, copiados para que la UI no mute la configuración. */
export function accessRequirements(planetId) {
  const planet = planetById(planetId);
  return { ...(planet?.civilization?.requiredMaterials || {}) };
}

export function civilizationPlanet(planetId) {
  return planetById(planetId);
}
