/**
 * Settings - Ajustes persistentes (localStorage) con valores por defecto.
 * Cualquier módulo puede leerlos y suscribirse a cambios.
 */
const KEY = 'walle-sistema-solar:settings:v2';

export const DEFAULT_SETTINGS = {
  lookSensitivity: 1.0,   // joystick de cámara táctil / stick derecho del mando (0.3 – 2.5)
  mouseSensitivity: 1.0,  // multiplicador del ratón (0.3 – 2.5)
  controlScale: 1.0,      // tamaño de botones y joysticks táctiles (0.85 – 1.4)
  vibration: true,        // vibración háptica en Android
  fullscreen: true,       // pantalla completa + horizontal al jugar en móvil
  cameraStart: 'third',   // 'third' | 'first'
  quality: 0,             // 0 auto, 1 baja, 2 media, 3 alta, 4 ultra
  volume: 70,             // 0 – 100
  tutorialDone: false,
};

function load() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {}; // modo privado / almacenamiento bloqueado
  }
}

class SettingsStore {
  constructor() {
    this.data = { ...DEFAULT_SETTINGS, ...load() };
    this._listeners = new Set();
  }

  get(key) { return this.data[key]; }

  set(key, value) {
    if (this.data[key] === value) return;
    this.data[key] = value;
    this._save();
    for (const fn of this._listeners) {
      try { fn(key, value); } catch (e) { /* noop */ }
    }
  }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _save() {
    try { window.localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* noop */ }
  }
}

export const settings = new SettingsStore();
