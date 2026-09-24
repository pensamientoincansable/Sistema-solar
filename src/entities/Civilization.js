import { MATERIALS, PLANETS_CONFIG } from '../config/PlanetsConfig.js';
import { accessRequirements, civilizationPlanet } from '../config/CivilizationConfig.js';

/**
 * CivilizationManager - Progreso de acceso que habilita las colonias de
 * superficie.
 *
 * Antes `build()` añadía una semiesfera junto al planeta. Eso mezclaba dos
 * juegos distintos (un edificio espacial y la colonia RTS) y hacía que el
 * jugador creyera que había aterrizado cuando solo había construido un mesh.
 * Ahora el menú solo consume los materiales y registra el permiso de acceso;
 * la colonia real la crea CivMode al entrar en la superficie.
 */
export class CivilizationManager {
  constructor(solarSystem) {
    this.solarSystem = solarSystem;
    this.inventory = {
      metal: 0, polymer: 0, glass: 0, energy: 0, bio: 0,
      water: 0, gas: 0, ice: 0, crystal: 0, concrete: 0,
    };
    // `built` se conserva como nombre de save antiguo: ahora significa
    // "acceso desbloqueado", nunca una estructura 3D orbital.
    this.built = {};
    this.totalBuilt = 0;
    this.onUpdate = null;
  }

  addMaterials(materials) {
    for (const [key, value] of Object.entries(materials || {})) {
      if (this.inventory[key] !== undefined && typeof value === 'number' && Number.isFinite(value)) {
        this.inventory[key] = Math.max(0, this.inventory[key] + value);
      }
    }
    this.notify();
  }

  isUnlocked(planetId) {
    return !!(this.built && this.built[planetId]);
  }

  /** Devuelve los requisitos y el estado para la pantalla de civilizaciones. */
  canBuild(planetId) {
    const planet = this.solarSystem?.getPlanetById(planetId)
      || PLANETS_CONFIG.find(p => p.id === planetId);
    if (!planet) return { can: false, reason: 'Planeta no encontrado' };
    if (this.isUnlocked(planetId)) return { can: false, unlocked: true, planet, reason: 'Acceso ya desbloqueado' };
    const req = accessRequirements(planetId);
    for (const [mat, need] of Object.entries(req)) {
      const have = this.inventory[mat] || 0;
      if (have < need) return { can: false, missing: mat, need, have, planet, requirements: req };
    }
    return { can: true, planet, requirements: req };
  }

  /**
   * Consume los materiales y desbloquea el aterrizaje en la superficie.
   * `scene` se acepta por compatibilidad con partidas/código de versiones
   * anteriores, pero deliberadamente no se usa para crear ningún objeto.
   */
  build(planetId, scene = null) { // eslint-disable-line no-unused-vars
    const check = this.canBuild(planetId);
    if (!check.can) return check;
    const req = check.requirements || accessRequirements(planetId);
    for (const [mat, amount] of Object.entries(req)) this.inventory[mat] -= amount;
    this.built[planetId] = 1;
    this.totalBuilt++;
    this.notify();
    return {
      can: true,
      unlocked: true,
      built: this.built[planetId],
      planet: check.planet,
      bonus: check.planet.config?.civilization?.bonus || civilizationPlanet(planetId)?.civilization?.bonus,
    };
  }

  getProgress() {
    const totalPlanets = this.solarSystem?.planets?.length || PLANETS_CONFIG.length;
    const colonized = Object.values(this.built || {}).filter(Boolean).length;
    return {
      colonized,
      totalPlanets,
      percent: totalPlanets ? Math.round((colonized / totalPlanets) * 100) : 0,
      totalBuilt: this.totalBuilt,
    };
  }

  notify() {
    if (this.onUpdate) this.onUpdate(this.inventory, this.built);
  }

  /** Nueva misión: borra accesos y elimina cualquier mesh legado de versiones anteriores. */
  reset() {
    for (const key of Object.keys(this.inventory)) this.inventory[key] = 0;
    this.built = {};
    this.totalBuilt = 0;
    this.notify();
  }

  getInventoryList() {
    return Object.entries(this.inventory).map(([id, amount]) => ({
      id,
      ...MATERIALS[id],
      amount,
    }));
  }
}
