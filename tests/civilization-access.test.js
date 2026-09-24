import test from 'node:test';
import assert from 'node:assert/strict';
import { PLANETS_CONFIG } from '../src/config/PlanetsConfig.js';
import { CivilizationManager } from '../src/entities/Civilization.js';
import { asteroidLootForPlanet } from '../src/config/CivilizationConfig.js';

function makeSolarSystem() {
  const planets = PLANETS_CONFIG.map(config => ({ config }));
  return {
    planets,
    getPlanetById(id) { return planets.find(planet => planet.config.id === id) || null; },
  };
}

test('desbloquear acceso consume requisitos pero nunca crea una estructura orbital', () => {
  const civilization = new CivilizationManager(makeSolarSystem());
  const requirements = PLANETS_CONFIG.find(planet => planet.id === 'earth').civilization.requiredMaterials;
  civilization.addMaterials(requirements);

  const result = civilization.build('earth', { add() { throw new Error('no debe añadirse ningún mesh orbital'); } });

  assert.equal(result.can, true);
  assert.equal(result.unlocked, true);
  assert.equal(civilization.isUnlocked('earth'), true);
  assert.equal(civilization.inventory.bio, 0);
  assert.equal(civilization.canBuild('earth').unlocked, true);
});

test('cada asteroide entrega x20 al objetivo y x10/x5 a planetas distintos ordenados por distancia', () => {
  const loot = asteroidLootForPlanet('earth');
  assert.deepEqual(loot.map(item => item.amount), [20, 10, 5]);
  assert.equal(loot[0].planetId, 'earth');
  assert.equal(loot[1].planetId, 'neptune');
  assert.equal(loot[2].planetId, 'uranus');
  assert.equal(new Set(loot.map(item => item.planetId)).size, 3);
});
