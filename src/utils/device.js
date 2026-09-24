/**
 * Utilidades de dispositivo compartidas (antes cada módulo tenía su propia
 * heurística y podían discrepar: el HUD creía estar en PC y los controles
 * táctiles en móvil).
 */

let _touchCache = null;

/** True en móviles/tablets con pantalla táctil como puntero principal. */
export function isTouchUI() {
  if (_touchCache !== null) return _touchCache;
  if (typeof window === 'undefined') return false;
  try {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const hover = window.matchMedia('(hover: hover)').matches;
    const hasTouch = 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0;
    // Portátiles táctiles con ratón (hover) no cuentan como móvil.
    _touchCache = (coarse && !hover) || (hasTouch && coarse && Math.min(window.innerWidth, window.innerHeight) <= 820);
  } catch (e) {
    _touchCache = 'ontouchstart' in window && (navigator.maxTouchPoints || 0) > 0;
  }
  return _touchCache;
}

export function isAndroid() {
  try { return /android/i.test(navigator.userAgent || ''); } catch (e) { return false; }
}

/** Vibración háptica corta (Android). Silencioso si no está soportada. */
export function vibrate(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (e) { /* noop */ }
}

/** Pantalla completa + orientación horizontal (solo funciona tras un gesto del usuario). */
export async function enterImmersiveMode() {
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) {
      await el.requestFullscreen({ navigationUI: 'hide' });
    }
    if (screen.orientation && screen.orientation.lock) {
      await screen.orientation.lock('landscape').catch(() => {});
    }
  } catch (e) { /* iOS / navegadores sin soporte: se juega en ventana */ }
}
