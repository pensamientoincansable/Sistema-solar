import './style.css';
import { Game } from './core/Game.js';

/**
 * Muestra un mensaje de error en pantalla si la inicialización falla.
 * Fundamental para evitar que el usuario se quede con pantalla en negro.
 */
function showFatalError(message, detail = '') {
  console.error('[FATAL]', message, detail);

  // Ocultar el loading screen si existe
  const loader = document.getElementById('loading-screen');
  if (loader) {
    loader.style.display = 'none';
  }

  // Crear overlay de error
  let errEl = document.getElementById('fatal-error');
  if (!errEl) {
    errEl = document.createElement('div');
    errEl.id = 'fatal-error';
    errEl.style.cssText = `
      position: fixed;
      inset: 0;
      background: radial-gradient(circle at center, #1a0000 0%, #000 100%);
      color: #ff3b3b;
      font-family: 'Orbitron', monospace, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px;
      z-index: 9999;
      text-align: center;
    `;
    document.body.appendChild(errEl);
  }

  errEl.innerHTML = `
    <div style="font-size: 3rem; margin-bottom: 16px;">⚠️</div>
    <h1 style="font-size: 1.5rem; color: #ff3b3b; margin: 0 0 16px; letter-spacing: 0.2em;">
      ERROR DE INICIALIZACIÓN
    </h1>
    <p style="font-size: 1rem; color: #ffaaaa; max-width: 600px; line-height: 1.6; margin: 0 0 20px;">
      ${message}
    </p>
    ${detail ? `<pre style="
      background: rgba(0,0,0,0.5);
      padding: 16px;
      border-radius: 8px;
      border: 1px solid #ff3b3b44;
      color: #ffcccc;
      font-size: 0.75rem;
      max-width: 800px;
      overflow: auto;
      max-height: 240px;
      text-align: left;
    ">${detail.replace(/</g, '&lt;')}</pre>` : ''}
    <button onclick="location.reload()" style="
      margin-top: 24px;
      padding: 12px 32px;
      background: rgba(255, 59, 59, 0.15);
      border: 1px solid #ff3b3b;
      color: #ffaaaa;
      font-family: inherit;
      font-size: 0.9rem;
      letter-spacing: 0.15em;
      cursor: pointer;
      border-radius: 6px;
      text-transform: uppercase;
    ">Recargar página</button>
  `;
}

/**
 * Verifica disponibilidad de WebGL antes de inicializar el juego.
 * Si no hay WebGL, muestra mensaje claro y no intenta continuar.
 */
function checkWebGLSupport() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ||
               canvas.getContext('webgl') ||
               canvas.getContext('experimental-webgl');
    if (!gl) {
      return { ok: false, reason: 'Tu navegador no soporta WebGL' };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'WebGL no disponible: ' + e.message };
  }
}

// Capturar errores globales no manejados
window.addEventListener('error', (event) => {
  // Solo mostrar errores fatales que rompen el flujo principal
  if (event.error && !window.__gameInitialized) {
    showFatalError(
      'Error inesperado durante el inicio del juego.',
      event.error.stack || event.error.message || String(event.error)
    );
  }
});

window.addEventListener('unhandledrejection', (event) => {
  if (!window.__gameInitialized) {
    const reason = event.reason;
    showFatalError(
      'Error de carga asíncrona durante el inicio del juego.',
      reason && (reason.stack || reason.message) || String(reason)
    );
  }
});

// Punto de entrada
try {
  const canvas = document.getElementById('game-canvas');
  if (!canvas) {
    showFatalError('No se encontró el elemento canvas del juego (#game-canvas).');
  } else {
    // Comprobar WebGL antes de continuar
    const webglCheck = checkWebGLSupport();
    if (!webglCheck.ok) {
      showFatalError(webglCheck.reason, 'El juego requiere WebGL habilitado. Actualiza tu navegador o habilita la aceleración por hardware.');
    } else {
      const game = new Game(canvas);
      window.game = game;
      window.__gameInitialized = true;

      // Mensaje bienvenida consola
      console.log(
        `%c WALL·E SISTEMA SOLAR %c
Misión: Recolecta basura espacial y construye civilizaciones
Controles:
  WASD / Joystick -> Mover
  Ratón / Joystick derecho -> Mirar
  Click / F -> Disparar
  1/2 -> Cambiar arma (Láser / Plasma)
  Q / E -> Subir / Bajar
  ESPACIO -> Depositar en refinería
  C -> Cambiar cámara (1ra / 3ra persona)
  Shift -> Boost
  ESC / P -> Pausa
Optimizado para Móvil / PC / TV con resolución adaptativa
`,
        'background:#00f0ff;color:#000;padding:6px 12px;font-weight:bold;font-family:Orbitron;',
        'color:#e0f7ff;font-family:monospace;'
      );
    }
  }
} catch (err) {
  showFatalError(
    'Error crítico durante el inicio del juego.',
    err.stack || err.message || String(err)
  );
}
