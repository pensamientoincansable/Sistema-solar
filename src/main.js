import './style.css';
import { Game } from './core/Game.js';

const canvas = document.getElementById('game-canvas');
if (!canvas) {
  console.error('Canvas no encontrado');
} else {
  const game = new Game(canvas);
  window.game = game; // debug

  // Registro Service Worker opcional para PWA / offline (optimización)
  if ('serviceWorker' in navigator) {
    // No SW en dev, solo log
    console.log('[PWA] Service Worker soportado');
  }

  // Detección de visibilidad para pausar
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.isPlaying) {
      // No auto-pausar en mobile, solo reducir fps
      console.log('[Game] Tab oculto');
    }
  });

  // Mensaje bienvenida consola
  console.log(
    `%c WALL·E SISTEMA SOLAR %c
Misión: Recolecta basura espacial y construye civilizaciones
Controles:
  WASD / Joystick -> Mover
  Ratón / Joystick derecho -> Mirar
  Click / F -> Disparar
  1/2 -> Cambiar arma (Láser / Plasma)
  ESPACIO -> Recolectar / Depositar en refinería
  C -> Cambiar cámara (1ra / 3ra persona)
  Shift -> Boost
  ESC / P -> Pausa
Optimizado para Móvil / PC / TV con resolución adaptativa
`,
    'background:#00f0ff;color:#000;padding:6px 12px;font-weight:bold;font-family:Orbitron;',
    'color:#e0f7ff;font-family:monospace;'
  );
}
