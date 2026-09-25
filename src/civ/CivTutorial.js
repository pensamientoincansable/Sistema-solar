/**
 * CivTutorial - Tutorial de construcción del primer planeta.
 *
 * No depende de three.js ni del DOM: son pasos con una condición de victoria
 * sobre la colonia, de modo que se puede probar en Node y reutilizar desde la
 * interfaz. El orden está pensado para no quedarse estancado en el primer
 * aterrizaje: comida -> madera -> viviendas -> mineral -> construcción.
 */

/** Pasos del tutorial. `done` recibe la colonia (o null si aún no existe). */
export const CIV_TUTORIAL_STEPS = [
  {
    id: 'mira',
    icon: '👀',
    title: 'Conoce tu colonia',
    text: 'Arrastra para girar la cámara y la rueda (o dos dedos) para acercar. Toca un civil para seleccionarlo.',
    done: (c) => !!c && c.age > 5,
  },
  {
    id: 'train',
    icon: '🏛️',
    title: 'Crea civiles en el ayuntamiento',
    text: 'Abre el panel del Ayuntamiento y pulsa «Nuevo civil» (🍞 30). El límite de población sube con cada vivienda.',
    done: (c) => !!c && c.population >= 5,
  },
  {
    id: 'farm',
    icon: '🌾',
    title: 'Construye una Granja',
    text: 'Sin alimento la colonia pasa hambre y muere. Pon la granja cerca del centro y sube la prioridad de Alimento.',
    done: (c) => !!c && c.countType('farm') >= 1,
  },
  {
    id: 'sawmill',
    icon: '🪚',
    title: 'Construye una Carpintería',
    text: 'La madera es el material de todo. Debe quedar junto a un bosque (los círculos verdes del minimapa).',
    done: (c) => !!c && c.countType('sawmill') >= 1,
  },
  {
    id: 'houses',
    icon: '🏠',
    title: 'Levanta 2 Viviendas',
    text: 'Cada vivienda suma +4 de población máxima. Con dos viviendas el ayuntamiento puede crear más civiles.',
    done: (c) => !!c && c.countType('house') >= 2,
  },
  {
    id: 'mine',
    icon: '⛏️',
    title: 'Construye una Minería',
    text: 'Junto a un filón (círculos grises) sacarás piedra y metal para el resto de edificios.',
    done: (c) => !!c && c.countType('mine') >= 1,
  },
  {
    id: 'builders',
    icon: '🏗️',
    title: 'Mantén la prioridad de Construcción alta',
    text: 'Las obras solo avanzan si hay constructores. Déjala en 7-10 hasta que termines tus edificios.',
    done: (c) => !!c && (c.priority.build || 0) >= 7,
  },
  {
    id: 'energy',
    icon: '⚡',
    title: 'Prepara la era Aldea',
    text: 'Con 200 de alimento, 250 de madera y 150 de metal (más 60 de conocimiento) avanza de era para construir energía.',
    done: (c) => !!c && c.era >= 1,
  },
  {
    id: 'defense',
    icon: '🛡️',
    title: 'Defiende la colonia',
    text: 'La primera incursión llega a los ~100 s. Torretas, cuartel y guardias la repelen; si no, perderás edificios.',
    done: (c) => !!c && (c.countType('turret') + c.countType('barracks')) >= 1,
  },
  {
    id: 'orbit',
    icon: '🚀',
    title: 'Conecta con la órbita',
    text: 'En era Ciudad construye el Puerto espacial para enviar materiales a WALL·E y cerrar el círculo.',
    done: (c) => !!c && c.hasSpaceport(),
  },
];

export class CivTutorial {
  constructor(colony = null, options = {}) {
    this.colony = colony;
    this.planetId = options.planetId || (colony && colony.planetId) || null;
    this.index = 0;
    this.done = false;
    this.dismissed = !!options.dismissed;
    this.seen = new Set(options.seen || []);
    this._notice = null;
    this._noticeT = 0;
  }

  /** Colonia sobre la que se evalúan los pasos (puede cambiar al aterrizar). */
  setColony(colony) {
    this.colony = colony;
  }

  get step() {
    if (this.done || this.dismissed) return null;
    return CIV_TUTORIAL_STEPS[Math.min(this.index, CIV_TUTORIAL_STEPS.length - 1)] || null;
  }

  get progress() {
    return `${Math.min(this.index + 1, CIV_TUTORIAL_STEPS.length)}/${CIV_TUTORIAL_STEPS.length}`;
  }

  /** Marca el paso actual como cumplido y avanza. Devuelve el nuevo paso. */
  advance() {
    const current = CIV_TUTORIAL_STEPS[this.index];
    if (current) this.seen.add(current.id);
    this.index++;
    if (this.index >= CIV_TUTORIAL_STEPS.length) {
      this.done = true;
      this.index = CIV_TUTORIAL_STEPS.length - 1;
    }
    return this.step;
  }

  /** Cierra el tutorial (se puede volver a abrir desde el panel). */
  dismiss() {
    this.dismissed = true;
  }

  open() {
    this.dismissed = false;
    if (this.done) {
      this.done = false;
      this.index = CIV_TUTORIAL_STEPS.length - 1;
    }
    return this.step;
  }

  /**
   * Revisa el paso actual. Devuelve true si se ha completado algún paso, para
   * que la interfaz pueda mostrar un aviso.
   */
  update() {
    if (!this.colony || this.done || this.dismissed) return false;
    let changed = false;
    // Un paso puede cumplirse por consecución de otro: se comprueban en orden.
    for (let guard = 0; guard < CIV_TUTORIAL_STEPS.length; guard++) {
      const step = CIV_TUTORIAL_STEPS[this.index];
      if (!step) { this.done = true; break; }
      let ok = false;
      try { ok = !!step.done(this.colony); } catch (e) { ok = false; }
      if (!ok) break;
      this.seen.add(step.id);
      this.index++;
      changed = true;
      if (this.index >= CIV_TUTORIAL_STEPS.length) {
        this.done = true;
        this.index = CIV_TUTORIAL_STEPS.length - 1;
        break;
      }
    }
    return changed;
  }

  toJSON() {
    return {
      index: this.index,
      done: this.done,
      dismissed: this.dismissed,
      planetId: this.planetId,
      seen: Array.from(this.seen),
    };
  }

  static fromJSON(data, colony = null) {
    const t = new CivTutorial(colony, {
      dismissed: !!(data && data.dismissed),
      planetId: data && data.planetId,
      seen: (data && data.seen) || [],
    });
    if (data && typeof data.index === 'number') {
      t.index = Math.max(0, Math.min(CIV_TUTORIAL_STEPS.length - 1, data.index | 0));
    }
    t.done = !!(data && data.done);
    return t;
  }
}
