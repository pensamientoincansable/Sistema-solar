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

    // Banderas de subsistemas inicializados
    this._sys = {
      input: false, adaptive: false, solar: false, walle: false,
      trash: false, combat: false, enemy: false, refinery: false,
      civ: false, hud: false, menu: false, mobile: false
    };

    // Guardar referencias opcionales (pueden no existir si falla)
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
        this.enemySystem = new EnemySystem(this.scene, this.solarSystem, this.trashSystem, this.quality);
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
      const hemi = new THREE.HemisphereLight(0x606060, 0x202030, 0.8);
      this.scene.add(hemi);
    } catch (err) {
      console.error('[Game] HemisphereLight error:', err);
    }

    // Vincular callback de civilización si ambos existen
    if (this.civilization && this.menu) {
      this.civilization.onUpdate = () => {
        try { this.menu.updateMaterials(); } catch(e) { /* noop */ }
      };
    }

    try {
      this.bindEvents();
    } catch (err) {
      console.error('[Game] bindEvents error:', err);
    }

    this.animate = this.animate.bind(this);

    // SIEMPRE ocultar loading screen después de un tiempo prudente,
    // incluso si algún subsistema falló. Si fallaron subsistemas,
    // el menú holográfico se mostrará de todas formas para no dejar al usuario en negro.
    this._hideLoadingSafe(1200);

    try {
      requestAnimationFrame(this.animate);
    } catch (err) {
      console.error('[Game] requestAnimationFrame error:', err);
    }

    console.log('[Game] Inicializado - Calidad:', this.quality,
      'Subsistemas OK:', Object.entries(this._sys).filter(([k,v])=>v).map(([k])=>k).join(','));
  }

  /**
   * Inicializa escena, cámara y renderer. Si falla, lanza excepción capturada
   * en el constructor que mostrará un error visible.
   */
  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x000000, 0.0012);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 3000);
    this.camera.position.set(0, 20, -40);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.textureLoader = new THREE.TextureLoader();
    // setPath fija el prefijo de rutas. Usamos '/' para que rutas '/textures/x' funcionen.
    this.textureLoader.setPath('/');
  }

  /**
   * Oculta el loading screen de manera segura. Si hay un error visible,
   * no se sobreescribe el contenido.
   */
  _hideLoadingSafe(delay = 0) {
    setTimeout(() => {
      try {
        // Si ya hay un error fatal visible, no tocar nada
        if (document.getElementById('fatal-error')) return;

        const loader = document.getElementById('loading-screen');
        if (loader) {
          loader.classList.add('hidden');
          setTimeout(() => {
            try { loader.style.display = 'none'; } catch(e) {}
          }, 800);
        }

        // Si el menú existe, asegurarse de que sea visible
        if (this.menu && this.menu.show) {
          try { this.menu.show(); } catch(e) {}
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
          loader.innerHTML = `
            <div style="text-align:center;color:#ff3b3b;font-family:Orbitron,monospace;padding:32px;max-width:600px">
              <div style="font-size:3rem;margin-bottom:16px">⚠️</div>
              <h2 style="margin:0 0 16px;letter-spacing:0.2em">ERROR</h2>
              <p style="color:#ffaaaa;line-height:1.6;margin:0 0 16px">${message}</p>
              <p style="color:#888;font-size:0.75rem">${(err && (err.stack || err.message)) || ''}</p>
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
        // Último recurso: alert
        try { alert(message + '\n' + ((err && err.message) || '')); } catch(_) {}
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

    // Pausa con ESC o P
    window.addEventListener('keydown', e => {
      try {
        if (e.code === 'Escape' || e.code === 'KeyP') {
          if (this.isPlaying) this.pauseGame();
        }
      } catch (err) {
        console.error('[Game] keydown error:', err);
      }
    });
  }

  startGame() {
    try {
      this.isPlaying = true;
      this.isPaused = false;
      this.clock.start();
      if (this.menu) {
        this.menu.hide();
        this.menu.setContinueVisible && this.menu.setContinueVisible(true);
      }
      if (this.hud) {
        this.hud.show();
        this.hud.notify('¡Misión iniciada! Recolecta basura espacial', 'success');
        this.hud.notify('WASD mover | Ratón mirar | Click disparar | C cambiar cámara | ESPACIO depositar', 'info');
      }
      this.canvas.focus();
    } catch (err) {
      console.error('[Game] startGame error:', err);
    }
  }

  pauseGame() {
    try {
      this.isPlaying = false;
      this.isPaused = true;
      if (this.menu) this.menu.show();
      if (this.hud) this.hud.hide();
      document.exitPointerLock?.();
    } catch (err) {
      console.error('[Game] pauseGame error:', err);
    }
  }

  resumeGame() {
    if (!this.isPaused) return;
    try {
      this.isPlaying = true;
      this.isPaused = false;
      if (this.menu) this.menu.hide();
      if (this.hud) this.hud.show();
    } catch (err) {
      console.error('[Game] resumeGame error:', err);
    }
  }

  handleShooting() {
    if (!this.isPlaying) return;
    if (!this.walle || !this.combat) return;
    if (this.input.shooting) {
      const now = performance.now();
      if (!this._lastShoot || now - this._lastShoot > (this.walle.weapon === 'laser' ? 150 : 400)) {
        this._lastShoot = now;
        const origin = this.walle.position.clone().add(new THREE.Vector3(0, 0.8, 2).applyQuaternion(this.walle.group.quaternion));
        const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(this.walle.group.quaternion);
        if (this.walle.cameraMode === 'first') {
          const camDir = new THREE.Vector3();
          this.camera.getWorldDirection(camDir);
          this.combat.shoot(origin, camDir, this.walle.weapon, 'player');
        } else {
          this.combat.shoot(origin, dir, this.walle.weapon, 'player');
        }
        if (this.walle.weapon === 'plasma' && this.walle.ammo.plasma > 0) {
          this.walle.ammo.plasma--;
        }
        if (this.walle.weapon === 'plasma' && this.walle.ammo.plasma <= 0) {
          this.walle.weapon = 'laser';
          if (this.hud) this.hud.notify('Plasma agotado, cambiando a láser', 'danger');
        }
        if (this.hud) this.hud.shootEffect();
      }
    }

    const ws = this.input.consumeWeaponSwitch();
    if (ws === 1) {
      this.walle.weapon = 'laser';
      if (this.hud) this.hud.notify('Arma: LÁSER', 'info');
    }
    if (ws === 2) {
      if (this.walle.ammo.plasma > 0) {
        this.walle.weapon = 'plasma';
        if (this.hud) this.hud.notify('Arma: PLASMA', 'info');
      } else if (this.hud) {
        this.hud.notify('Sin munición de plasma', 'danger');
      }
    }
  }

  handleCollection() {
    if (!this.isPlaying) return;
    if (!this.walle) return;
    if (this.trashSystem) {
      const collected = this.trashSystem.checkCollection(this.walle, 4.5);
      if (collected > 0 && this.hud) {
        this.hud.notify(`+${collected} basura recolectada (${this.walle.trashCount}/${this.walle.trashCapacity})`, 'success');
      }
    }

    if (this.input.collect && this.refinery && this.civilization) {
      const station = this.refinery.checkDeposit(this.walle);
      if (station) {
        const dep = this.walle.deposit();
        const refined = this.refinery.processMaterials(dep.materials, dep.count);
        this.civilization.addMaterials(refined);
        if (this.hud) this.hud.notify(`Depositado ${dep.count} unidades en ${station.userData.id}. Materiales refinados!`, 'success');
        if (this.combat) this.combat.createExplosion(station.position, 0x00f0ff, 1.2);
        this.input.collect = false;
      }
    }
  }

  animate() {
    requestAnimationFrame(this.animate);

    try {
      const delta = Math.min(this.clock.getDelta(), 0.05);
      const elapsed = this.clock.elapsedTime;

      if (this.input) this.input.update();
      if (this.mobile) this.mobile.update();
      if (this.adaptive) this.adaptive.update();

      if (this.input && this.walle && this.input.consumeCameraToggle()) {
        const mode = this.walle.toggleCameraMode();
        if (this.hud) this.hud.notify(`Cámara: ${mode === 'third' ? 'Tercera persona' : 'Primera persona'}`, 'info');
      }

      if (this.isPlaying) {
        if (this.walle && this.input && this.solarSystem) this.walle.update(delta, this.input, this.solarSystem);
        if (this.solarSystem) this.solarSystem.update(delta, elapsed);
        if (this.trashSystem && this.walle) this.trashSystem.update(delta, this.walle.position);
        if (this.enemySystem && this.walle && this.combat) this.enemySystem.update(delta, this.walle, this.combat);
        if (this.refinery) this.refinery.update(delta);
        if (this.combat && this.walle && this.enemySystem && this.trashSystem) {
          this.combat.update(delta, this.walle, this.enemySystem, this.trashSystem);
        }
        if (this.enemySystem && this.walle && this.combat) this.enemySystem.checkPlayerCollision(this.walle, this.combat);

        this.handleShooting();
        this.handleCollection();

        if (this.hud && this.walle && this.solarSystem && this.trashSystem && this.civilization && this.refinery) {
          this.hud.update(this.walle, this.solarSystem, this.trashSystem, this.civilization, this.refinery, delta);
        }

        if (this.walle && this.walle.health <= 0) {
          if (this.hud) this.hud.notify('¡WALL·E destruido! Reiniciando...', 'danger');
          this.walle.health = this.walle.maxHealth;
          this.walle.position.set(0, 0, 80);
          this.walle.velocity.set(0, 0, 0);
        }

        if (this.civilization && !this._won) {
          const prog = this.civilization.getProgress();
          if (prog.percent >= 100) {
            this._won = true;
            if (this.hud) this.hud.notify('¡FELICIDADES! Has civilizado todo el sistema solar 🌌', 'success');
          }
        }
      }

      if (this.renderer && this.scene && this.camera) {
        try {
          this.renderer.render(this.scene, this.camera);
        } catch (err) {
          // Si el render falla, no propagamos para no detener el loop
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
