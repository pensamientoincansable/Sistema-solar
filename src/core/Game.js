import * as THREE from 'three';
import { InputSystem } from './Input.js';
import { SolarSystem } from '../entities/SolarSystem.js';
import { WallE } from '../entities/WallE.js';
import { TrashSystem } from '../entities/Trash.js';
import { EnemySystem } from '../entities/Enemy.js';
import { Refinery } from '../entities/Refinery.js';
import { CivilizationManager } from '../entities/Civilization.js';
import { CombatSystem } from '../systems/Combat.js';
import { AdaptiveResolution } from '../utils/AdaptiveResolution.js';
import { MobileControls } from '../utils/MobileControls.js';
import { HUD } from '../ui/HUD.js';
import { HoloMenu } from '../ui/HoloMenu.js';

/**
 * Game - Orquestador principal del juego.
 * La inicialización es defensiva: si un subsistema falla, el juego intenta
 * continuar con los demás en lugar de quedarse en negro.
 */
export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.textureLoader = null;
    this.clock = new THREE.Clock();
    this.isPlaying = false;
    this.isPaused = false;
    this.hasStarted = false;
    this._idleAngle = 0;
    this._won = false;
    this._lastShoot = 0;
    this._lastOverheatNotify = 0;

    // Banderas de subsistemas inicializados
    this._sys = {
      input: false, adaptive: false, solar: false, walle: false,
      trash: false, combat: false, enemy: false, refinery: false,
      civ: false, hud: false, menu: false, mobile: false
    };

    this.input = null;
    this.adaptive = null;
    this.quality = null;
    this.solarSystem = null;
    this.walle = null;
    this.trashSystem = null;
    this.combat = null;
    this.enemySystem = null;
    this.refinery = null;
    this.civilization = null;
    this.hud = null;
    this.menu = null;
    this.mobile = null;

    try {
      this._initScene();
    } catch (err) {
      console.error('[Game] Error creando escena/renderer:', err);
      this._failLoading('No se pudo crear la escena 3D.', err);
      return;
    }

    try {
      this.input = new InputSystem(canvas);
      this._sys.input = true;
    } catch (err) {
      console.error('[Game] InputSystem error:', err);
    }

    try {
      this.adaptive = new AdaptiveResolution(this.renderer);
      this.quality = this.adaptive.getQualitySettings();
      this._sys.adaptive = true;
    } catch (err) {
      console.error('[Game] AdaptiveResolution error:', err);
      this.quality = {
        deviceType: 'pc', qualityLevel: 2, pixelRatio: 1,
        shadows: true, postProcessing: false, particleCount: 1000,
        trashCount: 100, enemyCount: 8, renderDistance: 1500
      };
    }

    try {
      this.solarSystem = new SolarSystem(this.scene, this.textureLoader);
      this._sys.solar = true;
    } catch (err) {
      console.error('[Game] SolarSystem error:', err);
    }

    try {
      this.walle = new WallE(this.scene, this.camera);
      this._sys.walle = true;
      this._placeWalleAtStart();
    } catch (err) {
      console.error('[Game] WallE error:', err);
    }

    try {
      if (this.solarSystem) {
        this.trashSystem = new TrashSystem(this.scene, this.solarSystem, this.quality);
        this._sys.trash = true;
      }
    } catch (err) {
      console.error('[Game] TrashSystem error:', err);
    }

    try {
      this.combat = new CombatSystem(this.scene);
      this._sys.combat = true;
    } catch (err) {
      console.error('[Game] CombatSystem error:', err);
    }

    try {
      if (this.solarSystem && this.trashSystem) {
        this.enemySystem = new EnemySystem(this.scene, this.solarSystem, this.trashSystem, this.quality, {
          avoidPosition: this.walle ? this.walle.position.clone() : null,
          avoidRadius: 110
        });
        this._sys.enemy = true;
      }
    } catch (err) {
      console.error('[Game] EnemySystem error:', err);
    }

    try {
      if (this.solarSystem) {
        this.refinery = new Refinery(this.scene, this.solarSystem);
        this._sys.refinery = true;
      }
    } catch (err) {
      console.error('[Game] Refinery error:', err);
    }

    try {
      if (this.solarSystem) {
        this.civilization = new CivilizationManager(this.solarSystem);
        this._sys.civ = true;
      }
    } catch (err) {
      console.error('[Game] CivilizationManager error:', err);
    }

    try {
      this.hud = new HUD();
      this.hud.onPause = () => this.pauseGame();
      this._sys.hud = true;
    } catch (err) {
      console.error('[Game] HUD error:', err);
    }

    try {
      this.menu = new HoloMenu(this);
      this._sys.menu = true;
    } catch (err) {
      console.error('[Game] HoloMenu error:', err);
    }

    try {
      if (this.input) {
        this.mobile = new MobileControls(this.input);
        this._sys.mobile = true;
      }
    } catch (err) {
      console.error('[Game] MobileControls error:', err);
    }

    // Luz hemisférica adicional para visibilidad de WALL-E
    try {
      const hemi = new THREE.HemisphereLight(0x8899bb, 0x202030, 0.6);
      this.scene.add(hemi);
    } catch (err) {
      console.error('[Game] HemisphereLight error:', err);
    }

    // Vincular callback de civilización si ambos existen
    if (this.civilization && this.menu) {
      this.civilization.onUpdate = () => {
        try { this.menu.updateMaterials(); } catch (e) { /* noop */ }
      };
      try { this.menu.updateMaterials(); } catch (e) { /* noop */ }
    }

    // Al perder la captura del puntero (ESC en el navegador) pausamos: el
    // keydown de Escape no llega a la página mientras el puntero está capturado.
    if (this.input) {
      this.input.onPointerLockLost = () => {
        if (this.isPlaying && !this.input.isTouchDevice()) this.pauseGame();
      };
      this.input.onPointerLockError = () => {
        if (this.isPlaying && this.hud) this.hud.notify('Haz clic en la pantalla para capturar el ratón', 'info');
      };
    }

    try {
      this.bindEvents();
    } catch (err) {
      console.error('[Game] bindEvents error:', err);
    }

    this.animate = this.animate.bind(this);

    // Ocultar loading screen tras un tiempo prudente, incluso si algún
    // subsistema falló: el menú holográfico se muestra de todas formas.
    this._hideLoadingSafe(900);

    try {
      requestAnimationFrame(this.animate);
    } catch (err) {
      console.error('[Game] requestAnimationFrame error:', err);
    }

    console.log('[Game] Inicializado - Calidad:', this.quality,
      'Subsistemas OK:', Object.entries(this._sys).filter(([k, v]) => v).map(([k]) => k).join(','));
  }

  /**
   * Inicializa escena, cámara y renderer. Si falla, lanza excepción capturada
   * en el constructor que mostrará un error visible.
   */
  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.0009);

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 4000);
    this.camera.position.set(0, 30, -70);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Las rutas se resuelven con assetUrl() en cada entidad (respetan la base
    // del despliegue). No usar setPath('/') aquí: generaba URLs '//textures/…'.
    this.textureLoader = new THREE.TextureLoader();

    // Si se pierde el contexto WebGL (móvil en segundo plano, GPU saturada)
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.warn('[Game] Contexto WebGL perdido');
      if (this.isPlaying) this.pauseGame();
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      console.log('[Game] Contexto WebGL restaurado');
    });
  }

  /** Coloca a WALL·E junto a la Tierra mirando hacia ella. */
  _placeWalleAtStart() {
    if (!this.walle) return;
    try {
      const earth = this.solarSystem && this.solarSystem.getPlanetById('earth');
      if (earth) {
        const ep = earth.getWorldPosition();
        const outward = ep.clone().normalize();            // dirección sol -> tierra
        const side = new THREE.Vector3(-outward.z, 0, outward.x); // tangente a la órbita
        // Entre el sol y la Tierra, mirando hacia ella: se ve su cara iluminada
        const spawn = ep.clone()
          .addScaledVector(outward, -(earth.config.radius + 16))
          .addScaledVector(side, 8)
          .add(new THREE.Vector3(0, 5, 0));
        this.walle.placeAt(spawn, ep);
      } else {
        this.walle.placeAt(new THREE.Vector3(0, 4, 90), new THREE.Vector3(0, 0, 0));
      }
    } catch (e) {
      console.warn('[Game] No se pudo colocar a WALL·E junto a la Tierra:', e);
    }
  }

  /**
   * Oculta el loading screen de manera segura. Si hay un error visible,
   * no se sobreescribe el contenido.
   */
  _hideLoadingSafe(delay = 0) {
    setTimeout(() => {
      try {
        if (document.getElementById('fatal-error')) return;

        const loader = document.getElementById('loading-screen');
        if (loader) {
          loader.classList.add('hidden');
          setTimeout(() => {
            try { loader.style.display = 'none'; } catch (e) { /* noop */ }
          }, 800);
        }

        if (this.menu && this.menu.show) {
          try { this.menu.show(); } catch (e) { /* noop */ }
        }
      } catch (e) {
        console.error('[Game] Error ocultando loading:', e);
      }
    }, delay);
  }

  /**
   * Muestra un error fatal en pantalla si algo crítico falla.
   */
  _failLoading(message, err) {
    setTimeout(() => {
      try {
        const loader = document.getElementById('loading-screen');
        if (loader) {
          const detail = ((err && (err.stack || err.message)) || '').replace(/</g, '&lt;');
          loader.innerHTML = `
            <div style="text-align:center;color:#ff3b3b;font-family:Orbitron,monospace;padding:32px;max-width:600px">
              <div style="font-size:3rem;margin-bottom:16px">⚠️</div>
              <h2 style="margin:0 0 16px;letter-spacing:0.2em">ERROR</h2>
              <p style="color:#ffaaaa;line-height:1.6;margin:0 0 16px">${message}</p>
              <p style="color:#888;font-size:0.75rem;white-space:pre-wrap;text-align:left">${detail}</p>
              <button onclick="location.reload()" style="
                margin-top:24px;padding:12px 32px;background:rgba(255,59,59,0.15);
                border:1px solid #ff3b3b;color:#ffaaaa;font-family:inherit;
                font-size:0.9rem;letter-spacing:0.15em;cursor:pointer;border-radius:6px;
                text-transform:uppercase;
              ">Recargar página</button>
            </div>
          `;
          loader.style.display = 'flex';
          loader.style.background = 'radial-gradient(circle at center, #1a0000 0%, #000 100%)';
        }
      } catch (e) {
        try { alert(message + '\n' + ((err && err.message) || '')); } catch (_) { /* noop */ }
      }
    }, 100);
  }

  bindEvents() {
    window.addEventListener('resize', () => {
      try {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        if (this.adaptive) this.quality = this.adaptive.getQualitySettings();
      } catch (e) {
        console.error('[Game] resize error:', e);
      }
    });

    // Pausar si la pestaña deja de estar visible
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.isPlaying) this.pauseGame();
    });
  }

  // ---------------------------------------------------------------------
  // Estado de juego
  // ---------------------------------------------------------------------

  startGame() {
    try {
      if (!this.hasStarted) {
        this.hasStarted = true;
        // Los planetas han seguido orbitando durante el menú: recolocar junto a la Tierra
        this._placeWalleAtStart();
        this.clock.start();
      }
      this.isPlaying = true;
      this.isPaused = false;
      this._lastStateChange = performance.now();
      if (this.menu) {
        this.menu.hide();
        this.menu.setContinueVisible(true);
      }
      if (this.hud) {
        this.hud.show();
        this.hud.notify('¡Misión iniciada! Recolecta basura espacial', 'success');
        if (this.input && this.input.isTouchDevice()) {
          this.hud.notify('Joystick izq. mover · der. mirar · 🔫 disparar · 📦 depositar', 'info');
        } else {
          this.hud.notify('WASD mover · Ratón mirar · Click disparar · C cámara · ESPACIO depositar · ESC pausa', 'info');
        }
      }
      if (this.mobile) this.mobile.setVisible(this.mobile.isMobile);
      if (this.input) this.input.requestPointerLock();
      this.canvas.focus({ preventScroll: true });
    } catch (err) {
      console.error('[Game] startGame error:', err);
    }
  }

  pauseGame() {
    if (!this.isPlaying) return;
    try {
      this.isPlaying = false;
      this.isPaused = true;
      this._lastStateChange = performance.now();
      if (this.menu) {
        this.menu.setContinueVisible(true);
        this.menu.show();
      }
      if (this.hud) this.hud.hide();
      if (this.input) this.input.exitPointerLock();
    } catch (err) {
      console.error('[Game] pauseGame error:', err);
    }
  }

  resumeGame() {
    if (!this.isPaused) return;
    this.startGame();
  }

  /** Reinicia la partida desde el principio (posición, salud, carga). */
  restartGame() {
    try {
      if (this.walle) {
        this._placeWalleAtStart();
        this.walle.health = this.walle.maxHealth;
        this.walle.trashCount = 0;
        Object.keys(this.walle.materials).forEach(k => { this.walle.materials[k] = 0; });
        this.walle.ammo.plasma = 50;
        this.walle.weapon = 'laser';
      }
      this._won = false;
      this.isPaused = false;
      this.hasStarted = false;
      if (this.enemySystem) this.enemySystem.resetGrace();
      this.startGame();
    } catch (err) {
      console.error('[Game] restartGame error:', err);
    }
  }

  // ---------------------------------------------------------------------
  // Lógica por frame
  // ---------------------------------------------------------------------

  handleShooting() {
    if (!this.isPlaying || !this.walle || !this.combat || !this.input) return;

    const ws = this.input.consumeWeaponSwitch();
    if (ws === 1 && this.walle.weapon !== 'laser') {
      this.walle.weapon = 'laser';
      if (this.hud) this.hud.notify('Arma: LÁSER', 'info');
    } else if (ws === 2 && this.walle.weapon !== 'plasma') {
      if (this.walle.ammo.plasma > 0) {
        this.walle.weapon = 'plasma';
        if (this.hud) this.hud.notify('Arma: PLASMA', 'info');
      } else if (this.hud) {
        this.hud.notify('Sin munición de plasma', 'danger');
      }
    }

    if (!this.input.shooting) return;
    const now = performance.now();
    const cadence = this.walle.weapon === 'laser' ? 150 : 400;
    if (now - this._lastShoot < cadence) return;
    this._lastShoot = now;

    const q = this.walle.group.quaternion;
    const origin = this.walle.position.clone().add(new THREE.Vector3(0, 0.8, 2).applyQuaternion(q));
    let dir;
    if (this.walle.cameraMode === 'first') {
      dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
    } else {
      dir = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    }
    this.combat.shoot(origin, dir, this.walle.weapon, 'player');

    if (this.walle.weapon === 'plasma') {
      this.walle.ammo.plasma = Math.max(0, this.walle.ammo.plasma - 1);
      if (this.walle.ammo.plasma <= 0) {
        this.walle.weapon = 'laser';
        if (this.hud) this.hud.notify('Plasma agotado, cambiando a láser', 'danger');
      }
    }
    if (this.hud) this.hud.shootEffect();
  }

  handleCollection() {
    if (!this.isPlaying || !this.walle || !this.input) return;

    if (this.trashSystem) {
      const collected = this.trashSystem.checkCollection(this.walle, 4.5);
      if (collected > 0 && this.hud) {
        this.hud.notify(`+${collected} basura recolectada (${this.walle.trashCount}/${this.walle.trashCapacity})`, 'success');
      }
    }

    const pressed = this.input.consumeCollectPress();
    if (pressed && this.refinery && this.civilization) {
      const station = this.refinery.checkDeposit(this.walle);
      if (station) {
        const dep = this.walle.deposit();
        const refined = this.refinery.processMaterials(dep.materials, dep.count);
        this.civilization.addMaterials(refined);
        if (this.hud) this.hud.notify(`Depositadas ${dep.count} unidades en ${station.userData.label || station.userData.id}. ¡Materiales refinados!`, 'success');
        if (this.combat) this.combat.createExplosion(station.position, 0x00f0ff, 1.2);
      } else if (this.walle.trashCount > 0 && this.hud) {
        this.hud.notify('Acércate a una refinería (toroide brillante) para depositar', 'info');
      }
    }
  }

  /** Cámara cinemática lenta alrededor del sol mientras se muestra el menú. */
  _updateIdleCamera(delta) {
    this._idleAngle += delta * 0.05;
    const r = 75;
    const x = Math.sin(this._idleAngle) * r;
    const z = Math.cos(this._idleAngle) * r;
    const y = 22 + Math.sin(this._idleAngle * 0.5) * 6;
    const target = new THREE.Vector3(x, y, z);
    this.camera.position.lerp(target, Math.min(1, delta * 2));
    this.camera.lookAt(0, 0, 0);
  }

  animate() {
    requestAnimationFrame(this.animate);

    try {
      const delta = Math.min(this.clock.getDelta(), 0.05);
      const elapsed = this.clock.elapsedTime;

      if (this.input) this.input.update();
      if (this.mobile) this.mobile.update();
      if (this.adaptive) this.adaptive.update();

      if (this.input && this.input.consumePause()) {
        // Ignorar peticiones inmediatamente posteriores a un cambio de estado:
        // al pulsar ESC con el puntero capturado, algunos navegadores entregan el
        // keydown Y liberan el puntero (lo que ya pausa), y se volvería a reanudar.
        const sinceChange = performance.now() - (this._lastStateChange || 0);
        if (sinceChange > 400) {
          if (this.isPlaying) this.pauseGame();
          else if (this.isPaused) this.resumeGame();
        }
      }

      if (this.isPlaying) {
        if (this.input && this.walle && this.input.consumeCameraToggle()) {
          const mode = this.walle.toggleCameraMode();
          if (this.hud) this.hud.notify(`Cámara: ${mode === 'third' ? 'Tercera persona' : 'Primera persona'}`, 'info');
        }

        if (this.walle && this.input) this.walle.update(delta, this.input, this.solarSystem);
        if (this.solarSystem) this.solarSystem.update(delta, elapsed);
        if (this.trashSystem && this.walle) this.trashSystem.update(delta, this.walle.position);
        if (this.enemySystem && this.walle) this.enemySystem.update(delta, this.walle, this.combat);
        if (this.refinery) this.refinery.update(delta);
        if (this.combat && this.walle) {
          this.combat.update(delta, this.walle, this.enemySystem, this.trashSystem);
        }
        if (this.enemySystem && this.walle) this.enemySystem.checkPlayerCollision(this.walle, this.combat);

        this.handleShooting();
        this.handleCollection();

        if (this.walle && this.walle.overheating && this.hud) {
          const now = performance.now();
          if (now - this._lastOverheatNotify > 2500) {
            this._lastOverheatNotify = now;
            this.hud.notify('🔥 ¡Calor extremo! Aléjate del sol', 'danger');
          }
        }

        if (this.hud && this.walle) {
          this.hud.update(this.walle, this.solarSystem, this.trashSystem, this.civilization, this.refinery, delta);
        }

        if (this.walle && this.walle.health <= 0) {
          if (this.hud) this.hud.notify('¡WALL·E destruido! Reiniciando en la Tierra...', 'danger');
          if (this.combat) this.combat.createExplosion(this.walle.position, 0xffaa00, 1.5);
          this.walle.respawn();
        }

        if (this.civilization && !this._won) {
          const prog = this.civilization.getProgress();
          if (prog.percent >= 100) {
            this._won = true;
            if (this.hud) this.hud.notify('¡FELICIDADES! Has civilizado todo el sistema solar 🌌', 'success');
          }
        }
      } else if (!this.hasStarted) {
        // Menú inicial: el sistema solar gira de fondo y la cámara orbita el sol
        if (this.solarSystem) this.solarSystem.update(delta, elapsed);
        if (this.refinery) this.refinery.update(delta);
        this._updateIdleCamera(delta);
      }

      if (this.renderer && this.scene && this.camera) {
        try {
          this.renderer.render(this.scene, this.camera);
        } catch (err) {
          if (!this._renderErrorLogged) {
            console.error('[Game] render error:', err);
            this._renderErrorLogged = true;
          }
        }
      }
    } catch (err) {
      console.error('[Game] animate error:', err);
    }
  }
}
