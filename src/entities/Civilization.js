import { MATERIALS } from '../config/PlanetsConfig.js';

export class CivilizationManager {
  constructor(solarSystem) {
    this.solarSystem = solarSystem;
    this.inventory = {
      metal: 0, polymer:0, glass:0, energy:0, bio:0, water:0, gas:0, ice:0, crystal:0, concrete:0
    };
    this.built = {}; // planetId -> level
    this.totalBuilt = 0;
    this.onUpdate = null; // callback UI
  }

  addMaterials(materials) {
    Object.keys(materials).forEach(k => {
      if (this.inventory[k] !== undefined && typeof materials[k]==='number') {
        this.inventory[k] += materials[k];
      }
    });
    this.notify();
  }

  canBuild(planetId) {
    const planet = this.solarSystem.getPlanetById(planetId);
    if (!planet) return { can:false, reason:'Planeta no encontrado' };
    const req = planet.config.civilization.requiredMaterials;
    for (const mat in req) {
      if ((this.inventory[mat]||0) < req[mat]) {
        return { can:false, missing: mat, need: req[mat], have: this.inventory[mat]||0 };
      }
    }
    return { can:true, planet };
  }

  build(planetId, scene) {
    const check = this.canBuild(planetId);
    if (!check.can) return check;
    const planet = check.planet;
    const req = planet.config.civilization.requiredMaterials;
    for (const mat in req) {
      this.inventory[mat] -= req[mat];
    }
    planet.addCivilizationStructure('dome', scene);
    this.built[planetId] = (this.built[planetId]||0)+1;
    this.totalBuilt++;
    this.notify();
    return { can:true, built: this.built[planetId], bonus: planet.config.civilization.bonus };
  }

  getProgress() {
    const totalPlanets = this.solarSystem.planets.length;
    const colonized = Object.keys(this.built).length;
    return {
      colonized,
      totalPlanets,
      percent: Math.round((colonized/totalPlanets)*100),
      totalBuilt: this.totalBuilt
    };
  }

  notify() {
    if (this.onUpdate) this.onUpdate(this.inventory, this.built);
  }

  /** Nueva misión: vacía el inventario y elimina las estructuras construidas. */
  reset() {
    Object.keys(this.inventory).forEach(k => { this.inventory[k] = 0; });
    this.built = {};
    this.totalBuilt = 0;
    if (this.solarSystem && this.solarSystem.planets) {
      this.solarSystem.planets.forEach(p => { try { p.clearCivilization(); } catch (e) { /* noop */ } });
    }
    this.notify();
  }

  getInventoryList() {
    return Object.entries(this.inventory).map(([id, amount]) => ({
      id,
      ...MATERIALS[id],
      amount
    }));
  }
}
