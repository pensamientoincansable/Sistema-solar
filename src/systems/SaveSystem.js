/**
 * SaveSystem - Partidas guardadas.
 *
 * - Guardado automático en el navegador (localStorage) cada pocos segundos y
 *   al pausar / cambiar de pestaña / cerrar.
 * - 3 huecos manuales para tener varias partidas.
 * - Exportar a archivo `.json` y cargarlo desde otro navegador o dispositivo
 *   (la partida es un JSON autocontenido, sin dependencias del sistema).
 *
 * El sistema no conoce el estado del juego: el juego registra `serialize` y
 * `apply` y aquí solo se almacena/valida el resultado.
 */
import { settings } from './Settings.js';

export const SAVE_VERSION = 1;
export const GAME_ID = 'walle-sistema-solar';
const SLOT_KEY = `${GAME_ID}:saves:v1`;
const SLOT_IDS = ['autosave', 'slot1', 'slot2', 'slot3'];

/** Almacén en memoria por si localStorage está bloqueado (modo privado). */
function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

/** localStorage real si funciona; si no, memoria (el juego sigue jugable). */
export function createStorage() {
  try {
    const s = window.localStorage;
    s.setItem(`${GAME_ID}:test`, '1');
    s.removeItem(`${GAME_ID}:test`);
    return s;
  } catch (e) {
    console.warn('[Save] localStorage no disponible: los guardados no persistirán al cerrar');
    return memoryStorage();
  }
}

function pad(n) { return String(n).padStart(2, '0'); }

function stamp(d = new Date()) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export class SaveSystem {
  constructor(options = {}) {
    this.storage = options.storage || (typeof window !== 'undefined' ? createStorage() : memoryStorage());
    this.autosaveSeconds = options.autosaveSeconds || 20;
    this.serialize = options.serialize || null;   // () => objeto de estado
    this.apply = options.apply || null;           // (state, meta) => void
    this.onSaved = options.onSaved || null;
    this._timer = null;
    this._lastAuto = 0;
    this._boundUnload = () => this.autosave('cerrando');
    this._boundHidden = () => { if (document.hidden) this.autosave('pausa'); };
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this._boundUnload);
      document.addEventListener('visibilitychange', this._boundHidden);
    }
  }

  // ------------------------------------------------------------------ Huecos

  _readAll() {
    try {
      const raw = this.storage.getItem(SLOT_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      console.warn('[Save] No se pudo leer el almacén de partidas:', e);
      return {};
    }
  }

  _writeAll(all) {
    try {
      this.storage.setItem(SLOT_KEY, JSON.stringify(all));
      return true;
    } catch (e) {
      console.error('[Save] No se pudo escribir la partida (¿almacenamiento lleno?):', e);
      return false;
    }
  }

  list() {
    const all = this._readAll();
    return SLOT_IDS.map(id => {
      const p = all[id];
      if (!p || !p.meta) return { id, empty: true };
      return {
        id,
        empty: false,
        savedAt: p.meta.savedAt,
        playTime: p.meta.playTime || 0,
        label: p.meta.label || '',
        version: p.saveVersion,
      };
    });
  }

  get(id) {
    const all = this._readAll();
    const p = all[id];
    if (!p) return null;
    const check = SaveSystem.validate(p);
    if (!check.ok) {
      console.warn(`[Save] Partida ${id} no válida: ${check.reason}`);
      return null;
    }
    return p;
  }

  /** Comprueba que un objeto sea una partida de este juego. */
  static validate(payload) {
    if (!payload || typeof payload !== 'object') return { ok: false, reason: 'El archivo no contiene una partida' };
    if (payload.game !== GAME_ID) return { ok: false, reason: 'No es una partida de WALL·E Sistema Solar' };
    if (typeof payload.saveVersion !== 'number') return { ok: false, reason: 'Falta la versión de la partida' };
    if (payload.saveVersion > SAVE_VERSION) return { ok: false, reason: 'La partida es de una versión más nueva del juego' };
    if (!payload.state || typeof payload.state !== 'object') return { ok: false, reason: 'La partida está vacía o dañada' };
    return { ok: true, payload };
  }

  // ------------------------------------------------------------------ Guardar

  _makePayload(label) {
    if (!this.serialize) return null;
    let state = null;
    try {
      state = this.serialize();
    } catch (e) {
      console.error('[Save] Error serializando el estado:', e);
      return null;
    }
    if (!state) return null;
    const now = new Date();
    return {
      game: GAME_ID,
      saveVersion: SAVE_VERSION,
      meta: {
        savedAt: now.toISOString(),
        label: label || state.label || '',
        playTime: Math.round((state.playTime || 0) * 10) / 10,
        credits: state.credits || 0,
        planets: state.planetsColonized || 0,
        colonies: state.colonies || 0,
      },
      settings: { ...settings.data },
      state,
    };
  }

  save(id = 'slot1', label = '') {
    if (!SLOT_IDS.includes(id)) return { ok: false, reason: 'Hueco de guardado desconocido' };
    const payload = this._makePayload(label);
    if (!payload) return { ok: false, reason: 'No se pudo generar la partida' };
    const all = this._readAll();
    all[id] = payload;
    if (!this._writeAll(all)) return { ok: false, reason: 'El navegador no pudo guardar (almacenamiento lleno o bloqueado)' };
    this._lastAuto = performance.now();
    if (this.onSaved) { try { this.onSaved(id, payload.meta); } catch (e) { /* noop */ } }
    return { ok: true, meta: payload.meta, payload };
  }

  /** Guardado automático: no molesta si el juego aún no ha empezado. */
  autosave(reason = '') {
    if (!this.serialize || !this._shouldAutosave()) return { ok: false, reason: 'nada que guardar' };
    this._lastAuto = performance.now();
    return this.save('autosave', reason ? `Auto (${reason})` : 'Automático');
  }

  _shouldAutosave() {
    if (this.requireStarted && !this.requireStarted()) return false;
    return true;
  }

  load(id = 'autosave') {
    const payload = this.get(id);
    if (!payload) return { ok: false, reason: 'No hay partida en ese hueco' };
    if (!this.apply) return { ok: false, reason: 'El juego no admite cargar partidas' };
    try {
      if (payload.settings && typeof payload.settings === 'object') {
        for (const k of Object.keys(payload.settings)) {
          if (k === 'tutorialDone') continue; // el tutorial no se vuelve a marcar
          settings.set(k, payload.settings[k]);
        }
      }
      this.apply(payload.state, payload.meta);
      return { ok: true, meta: payload.meta, payload };
    } catch (e) {
      console.error('[Save] Error aplicando la partida:', e);
      return { ok: false, reason: 'La partida no se pudo aplicar: ' + (e && e.message ? e.message : e) };
    }
  }

  remove(id) {
    const all = this._readAll();
    if (!all[id]) return false;
    delete all[id];
    return this._writeAll(all);
  }

  clearAll() {
    try { this.storage.removeItem(SLOT_KEY); return true; } catch (e) { return false; }
  }

  // ----------------------------------------------------- Archivo (.json)

  /** Descarga la partida como archivo para pasarla a otro navegador. */
  exportFile(id = 'slot1') {
    let payload = this.get(id);
    if (!payload) {
      // Si el hueco está vacío se genera sobre la marcha
      payload = this._makePayload(`Exportada ${stamp()}`);
      if (!payload) return { ok: false, reason: 'No hay partida que exportar' };
      const all = this._readAll();
      all[id] = payload;
      this._writeAll(all);
    }
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${GAME_ID}-partida-${stamp()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return { ok: true, filename: a.download };
    } catch (e) {
      console.error('[Save] Error exportando partida:', e);
      return { ok: false, reason: 'El navegador bloqueó la descarga' };
    }
  }

  /** Abre el selector de archivos y carga la partida elegida. */
  importFile() {
    return new Promise((resolve) => {
      try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.style.display = 'none';
        const done = (result) => { try { input.remove(); } catch (e) { /* noop */ } resolve(result); };
        input.addEventListener('change', async () => {
          const file = input.files && input.files[0];
          if (!file) { done({ ok: false, reason: 'Ningún archivo elegido', cancelled: true }); return; }
          try {
            const text = await file.text();
            const payload = JSON.parse(text);
            const check = SaveSystem.validate(payload);
            if (!check.ok) { done({ ok: false, reason: check.reason }); return; }
            if (!this.apply) { done({ ok: false, reason: 'El juego no admite cargar partidas' }); return; }
            if (payload.settings && typeof payload.settings === 'object') {
              for (const k of Object.keys(payload.settings)) {
                if (k === 'tutorialDone') continue;
                settings.set(k, payload.settings[k]);
              }
            }
            this.apply(payload.state, payload.meta);
            done({ ok: true, meta: payload.meta });
          } catch (e) {
            console.error('[Save] Error leyendo el archivo:', e);
            done({ ok: false, reason: 'El archivo no es una partida válida (JSON incorrecto)' });
          }
        });
        // Si el usuario cancela el diálogo no hay evento fiable en todos los
        // navegadores: se resuelve sin efecto (la partida no cambia).
        document.body.appendChild(input);
        input.click();
      } catch (e) {
        resolve({ ok: false, reason: 'El navegador no permite abrir archivos' });
      }
    });
  }

  /** Copia la partida al portapapeles (alternativa si no se pueden descargar archivos). */
  async copyToClipboard(id = 'slot1') {
    const payload = this.get(id) || this._makePayload('Copiada');
    if (!payload) return { ok: false, reason: 'No hay partida que copiar' };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload));
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: 'El navegador bloqueó el portapapeles' };
    }
  }

  // ---------------------------------------------------------------- Automático

  startAutosave() {
    this.stopAutosave();
    this._timer = setInterval(() => this.autosave(), this.autosaveSeconds * 1000);
    return this;
  }

  stopAutosave() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  tick(delta) {
    if (!this._timer) return;
    // Respaldo extra por si el setInterval se congela (pestaña en segundo plano)
    if (performance.now() - this._lastAuto > this.autosaveSeconds * 1400) this.autosave();
  }

  dispose() {
    this.stopAutosave();
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this._boundUnload);
      document.removeEventListener('visibilitychange', this._boundHidden);
    }
  }
}

export { SLOT_IDS };
