import * as THREE from 'three';
import { InputSystem } from './Input.js';
import { SolarSystem } from '../entities/SolarSystem.js';
import { WallE, CAMERA_PRESET_NAMES } from '../entities/WallE.js';
import { TrashSystem } from '../entities/Trash.js';
import { EnemySystem } from '../entities/Enemy.js';
import { Refinery } from '../entities/Refinery.js';
import { CivilizationManager } from '../entities/Civilization.js';
import { WaterSystem } from '../entities/WaterSystem.js';
import { AsteroidSystem } from '../entities/AsteroidSystem.js';
import { TaxiVendor } from '../entities/TaxiVendor.js';
import { CombatSystem } from '../systems/Combat.js';
import { ParticleSystem } from '../systems/Particles.js';
import { settings } from '../systems/Settings.js';
import { audio } from '../systems/AudioFX.js';
import { AdaptiveResolution } from '../utils/AdaptiveResolution.js';
import { MobileControls } from '../utils/MobileControls.js';
import { isTouchUI, enterImmersiveMode, vibrate } from '../utils/device.js';
import { preloadAll } from '../utils/ModelLibrary.js';
import { HUD } from '../ui/HUD.js';
import { HoloMenu } from '../ui/HoloMenu.js';
import { ShopUI } from '../ui/ShopUI.js';
import { Tutorial, TOUCH_STEPS, DESKTOP_STEPS } from '../ui/Tutorial.js';
import { WEAPONS, WEAPON_ORDER } from '../config/ShopConfig.js';
import { MATERIALS } from '../config/PlanetsConfig.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _near = { station: null, distance: Infinity };

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
    this.shopOpen = false;
    this.touch = isTouchUI();
    this._idleAngle = 0;
    this._won = false;
    this._lastShot = 0;
    this._needsRender = true;
    this._notifyTimes = {};
    this._pickupAgg = { trash: 0, water: 0, timer: 0 };
    this._lastHealth = 100;
    this._context = null;
    this._objTimer = 0;
    this._objective = '';

    this._sys = {};

    try {
      this._initScene();
    } catch (err) {
      console.error('[Game] Error creando escena/renderer:', err);
      this._failLoading('No se pudo crear la escena 3D.', err);
      return;
    }

    // Empezar a descargar los modelos GLB cuanto antes (en paralelo)
    try { preloadAll(); } catch (e) { /* noop */ }

    this._try('input', () => { this.input = new InputSystem(canvas); });
    this._try('adaptive', () => {
      this.adaptive = new AdaptiveResolution(this.renderer);
      const q = settings.get('quality') | 0;
      if (q > 0) this.adaptive.setQualityLevel(q - 1);
      this.adaptive.onChange = () => { this._needsRender = true; };
      this.quality = this.adaptive.getQualitySettings();
    });
    if (!this.quality) {
      this.quality = {
        deviceType: 'pc', qualityLevel: 2, pixelRatio: 1, particleMax: 600,
        trashCount: 100, waterCount: 70, enemyCount: 6, asteroidsPerWave: 4, renderDistance: 1500, lowresTextures: false,
      };
    }

    const lowres = this.touch || !!this.quality.lowresTextures;
    this._try('solar', () => { this.solarSystem = new SolarSystem(this.scene, this.textureLoader, { lowres }); });
    this._try('particles', () => { this.particles = new ParticleSystem(this.scene, this.quality.particleMax || 600); });
    this._try('walle', () => {
      this.walle = new WallE(this.scene, this.camera);
      this._placeWalleAtStart();
    });
    this._try('trash', () => { if (this.solarSystem) this.trashSystem = new TrashSystem(this.scene, this.solarSystem, this.quality); });
    this._try('water', () => { if (this.solarSystem) this.water = new WaterSystem(this.scene, this.solarSystem, this.quality); });
    this._try('combat', () => { this.combat = new CombatSystem(this.scene, this.particles); });
    this._try('enemy', () => {
      if (this.solarSystem && this.trashSystem) {
        this.enemySystem = new EnemySystem(this.scene, this.solarSystem, this.trashSystem, this.quality, {
          avoidPosition: this.walle ? this.walle.position.clone() : null,
          avoidRadius: 110,
        });
      }
    });
    this._try('refinery', () => { if (this.solarSystem) this.refinery = new Refinery(this.scene, this.solarSystem, this.particles); });
    this._try('asteroids', () => {
      this.asteroids = new AsteroidSystem(this.scene, this.refinery, this.particles, this.trashSystem, this.quality);
    });
    this._try('taxi', () => {
      if (this.solarSystem) {
        this.taxi = new TaxiVendor(this.scene, this.solarSystem);
        this._placeTaxiAtStart();
      }
    });
    this._try('civ', () => { if (this.solarSystem) this.civilization = new CivilizationManager(this.solarSystem); });
    this._try('hud', () => {
      this.hud = new HUD();
      this.hud.onPause = () => this.pauseGame();
    });
    this._try('menu', () => {
      this.menu = new HoloMenu(this);
      this.menu.onTutorial = () => this.showTutorialFromMenu();
    });
    this._try('mobile', () => { if (this.input) this.mobile = new MobileControls(this.input); });
    this._try('shop', () => {
      this.shop = new ShopUI();
      this.shop.onClose = () => this.closeShop();
      this.shop.onPurchase = (item) => {
        audio.play('buy');
        if (item.unlock && this.walle) this.walle.weapon = item.unlock;
      };
    });
    this._try('tutorial', () => {
      this.tutorial = new Tutorial();
      this.tutorial.onFinish = (skipped) => this._onTutorialFinished(skipped);
    });

    try {
      const hemi = new THREE.HemisphereLight(0x8899bb, 0x202030, 0.6);
      this.scene.add(hemi);
    } catch (err) {
      console.error('[Game] HemisphereLight error:', err);
    }

    this._wireEvents();

    try { this.bindEvents(); } catch (err) { console.error('[Game] bindEvents error:', err); }

    this.animate = this.animate.bind(this);
    this._hideLoadingSafe(900);
    try { requestAnimationFrame(this.animate); } catch (err) { console.error('[Game] requestAnimationFrame error:', err); }

    console.log('[Game] Inicializado - Calidad:', this.quality,
      'Subsistemas OK:', Object.entries(this._sys).filter(([, v]) => v).map(([k]) => k).join(','));
  }

  _try(name, fn) {
    try {
      fn();
      this._sys[name] = true;
    } catch (err) {
      this._sys[name] = false;
      console.error(`[Game] ${name} error:`, err);
    }
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.0009);

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 4000);
    this.camera.position.set(0, 30, -70);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      // En móvil el MSAA cuesta mucho ancho de banda y el DPR alto ya suaviza bordes
      antialias: !this.touch,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = false; // ninguna luz proyecta sombras

    this.textureLoader = new THREE.TextureLoader();

    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.warn('[Game] Contexto WebGL perdido');
      if (this.isPlaying) this.pauseGame();
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      console.log('[Game] Contexto WebGL restaurado');
      this._needsRender = true;
    });
  }

  /** Coloca a WALL·E junto a la Tierra (posición ACTUAL de su órbita) mirando hacia ella. */
  _placeWalleAtStart() {
    if (!this.walle) return;
    try {
      const earth = this.solarSystem && this.solarSystem.getPlanetById('earth');
      if (earth) {
        const ep = earth.getWorldPosition();
        const outward = ep.clone().normalize();
        const side = new THREE.Vector3(-outward.z, 0, outward.x);
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

  /** El taxi empieza aparcado a la vista del jugador, junto a la Tierra. */
  _placeTaxiAtStart() {
    if (!this.taxi || !this.walle) return;
    const w = this.walle;
    const fwd = _v1.set(0, 0, 1).applyEuler(w.rotation).setY(0).normalize();
    const right = _v2.set(-fwd.z, 0, fwd.x);
    const pos = w.position.clone().addScaledVector(fwd, 12).addScaledVector(right, 8);
    pos.y += 1.5;
    this.taxi.reset(pos, w.position);
  }

  _hideLoadingSafe(delay = 0) {
    setTimeout(() => {
      try {
        if (document.getElementById('fatal-error')) return;
        const loader = document.getElementById('loading-screen');
        if (loader) {
          loader.classList.add('hidden');
          setTimeout(() => { try { loader.style.display = 'none'; } catch (e) { /* noop */ } }, 800);
        }
        if (this.menu && this.menu.show) this.menu.show();
      } catch (e) {
        console.error('[Game] Error ocultando loading:', e);
      }
    }, delay);
  }

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
            </div>`;
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
        if (this.adaptive) this.quality = { ...this.quality, ...this.adaptive.getQualitySettings() };
        this._needsRender = true;
      } catch (e) {
        console.error('[Game] resize error:', e);
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.isPlaying) this.pauseGame();
    });

    // Tocar el aviso de "gira el móvil" permite seguir en vertical
    document.getElementById('rotate-hint')?.addEventListener('click', () => document.body.classList.add('portrait-ok'));

    if (this.input) {
      this.input.onPointerLockLost = () => {
        if (this.isPlaying && !this.shopOpen && !this.touch) this.pauseGame();
      };
      this.input.onPointerLockError = () => {
        if (this.isPlaying && this.hud) this.hud.notify('Haz clic en la pantalla para capturar el ratón', 'info');
      };
    }
  }

  _wireEvents() {
    if (this.civilization && this.menu) {
      this.civilization.onUpdate = () => { try { this.menu.updateMaterials(); } catch (e) { /* noop */ } };
      try { this.menu.updateMaterials(); } catch (e) { /* noop */ }
    }

    if (this.enemySystem) {
      this.enemySystem.onKilled = (enemy) => {
        const cr = enemy.config.credits || 20;
        this.addCredits(cr);
        audio.play('explosion');
        this._vibrate(35);
        this.notifyOnce('kill', `🛸 ${enemy.config.name} derribado · +${cr} CR${enemy.stolen ? ` · recuperas ${enemy.stolen} basura` : ''}`, 'success', 0);
      };
    }

    if (this.combat) {
      this.combat.onPlayerHit = () => { audio.play('hit'); this._vibrate(30); };
    }

    if (this.asteroids) {
      const a = this.asteroids;
      a.onWaveStart = (target, count) => {
        this.hud?.alert(`☄️ ¡LLUVIA DE ASTEROIDES! (${count}) Objetivo: ${target.userData.label}`, 'danger', 5500);
        audio.play('alert');
        this._vibrate([80, 60, 80]);
      };
      a.onImpact = (st, dmg, knockedOut) => {
        audio.play('explosion');
        if (!st) return;
        if (knockedOut) {
          this.hud?.alert(`⚠️ ${st.userData.label} FUERA DE SERVICIO — ¡repárala!`, 'danger', 5000);
          this._vibrate([120, 60, 120]);
        } else {
          this.notifyOnce('impact', `💥 Impacto en ${st.userData.label} (${Math.round(st.userData.health)}%)`, 'danger', 1.5);
        }
      };
      a.onDestroyed = (ast) => {
        const cr = ast.isFragment ? 6 : 12;
        this.addCredits(cr);
        audio.play('explosion');
        this.notifyOnce('ast', `☄️ Asteroide destruido · +${cr} CR`, 'success', 0.8);
      };
      a.onWaveEnd = (res) => {
        if (res.defended) {
          this.addCredits(40);
          this.hud?.alert('✅ ¡Refinerías defendidas! +40 CR', 'success', 3500);
          audio.play('restored');
        } else {
          this.hud?.alert(`Lluvia terminada · ${res.impacts} impacto${res.impacts === 1 ? '' : 's'}`, 'info', 3000);
        }
      };
    }
  }

  // ------------------------------------------------------------ Utilidades

  addCredits(n) {
    if (this.walle) this.walle.credits += n;
  }

  /** Notificación con límite de frecuencia por clave (segundos). */
  notifyOnce(key, message, type = 'info', minGap = 3) {
    const now = performance.now() / 1000;
    if (this._notifyTimes[key] && now - this._notifyTimes[key] < minGap) return;
    this._notifyTimes[key] = now;
    this.hud?.notify(message, type);
  }

  _vibrate(pattern) {
    if (this.touch && settings.get('vibration')) vibrate(pattern);
  }

  applyQualitySetting(idx) {
    if (!this.adaptive) return;
    if (idx === 0) this.adaptive.setAuto();
    else this.adaptive.setQualityLevel(idx - 1);
    this.quality = { ...this.quality, ...this.adaptive.getQualitySettings() };
    if (this.trashSystem) this.trashSystem.quality = this.quality;
    this._needsRender = true;
  }

  // ------------------------------------------------------------ Estado

  startGame() {
    try {
      audio.unlock();
      if (this.touch && settings.get('fullscreen')) enterImmersiveMode();
      let firstStart = false;
      if (!this.hasStarted) {
        firstStart = true;
        this.hasStarted = true;
        this._placeWalleAtStart();
        this._placeTaxiAtStart();
        if (this.walle) {
          this.walle.setCameraMode(settings.get('cameraStart') === 'first' ? 'first' : 'third');
          this.walle.snapCamera();
          this._lastHealth = this.walle.health;
        }
        if (this.enemySystem) this.enemySystem.resetGrace();
        this.clock.start();
      }
      this.isPlaying = true;
      this.isPaused = false;
      this._lastStateChange = performance.now();
      document.body.classList.add('playing');
      if (this.menu) {
        this.menu.hide();
        this.menu.setContinueVisible(true);
      }
      if (this.hud) this.hud.show();
      if (this.mobile) this.mobile.setVisible(this.mobile.isMobile);
      if (this.input) {
        this.input.flushEvents();
        this.input.requestPointerLock();
      }
      this.canvas.focus({ preventScroll: true });

      if (this.tutorial && this.tutorial.active) {
        this.tutorial.root.classList.add('visible');
      } else if (firstStart) {
        if (this._pendingTutorial || (this.touch && !settings.get('tutorialDone'))) {
          this._pendingTutorial = false;
          this.startTutorial();
        } else {
          this._beginMission();
        }
      }
    } catch (err) {
      console.error('[Game] startGame error:', err);
    }
  }

  _beginMission() {
    if (this.asteroids) this.asteroids.setEnabled(true);
    if (this.enemySystem) this.enemySystem.options.peaceful = false;
    if (this._missionBegun) {
      this.hud?.notify('🎓 Tutorial completado. ¡Sigue con la misión!', 'success');
      return;
    }
    this._missionBegun = true;
    this.hud?.notify('¡Misión iniciada! Recoge basura 🗑 y agua 💧', 'success');
    if (!this.touch) this.hud?.notify('WASD mover · Ratón mirar · Clic disparar · Rueda zoom · Espacio acción · Esc pausa', 'info');
    this.hud?.notify('🚕 El Taxi-Mercader vende armas y mejoras: ¡búscalo!', 'info');
  }

  startTutorial() {
    if (!this.tutorial) { this._beginMission(); return; }
    if (this.asteroids) this.asteroids.setEnabled(false);
    if (this.enemySystem) this.enemySystem.options.peaceful = true;
    this.tutorial.start(this.touch ? TOUCH_STEPS : DESKTOP_STEPS);
  }

  _onTutorialFinished() {
    if (this.enemySystem) this.enemySystem.resetGrace();
    if (this.asteroids) this.asteroids.timer = Math.max(this.asteroids.timer, 45);
    this._beginMission();
  }

  showTutorialFromMenu() {
    if (!this.hasStarted) {
      this._pendingTutorial = true;
      this.startGame();
    } else {
      if (this.isPaused) this.resumeGame();
      this.startTutorial();
    }
  }

  pauseGame() {
    if (!this.isPlaying) return;
    try {
      if (this.shopOpen) this.closeShop(true);
      this.isPlaying = false;
      this.isPaused = true;
      this._lastStateChange = performance.now();
      document.body.classList.remove('playing');
      if (this.tutorial && this.tutorial.active) this.tutorial.root.classList.remove('visible');
      if (this.menu) {
        this.menu.setContinueVisible(true);
        this.menu.show();
      }
      if (this.hud) this.hud.hide();
      if (this.mobile) this.mobile.setVisible(false);
      if (this.input) {
        this.input.releaseAll();
        this.input.exitPointerLock();
      }
      this._needsRender = true;
    } catch (err) {
      console.error('[Game] pauseGame error:', err);
    }
  }

  resumeGame() {
    if (!this.isPaused) return;
    this.startGame();
  }

  /** Nueva misión: reinicia TODO (antes se conservaban civilizaciones y enemigos). */
  restartGame() {
    try {
      if (this.shopOpen) this.closeShop(true);
      if (this.walle) this.walle.resetStats();
      if (this.civilization) this.civilization.reset();
      if (this.trashSystem) this.trashSystem.reset();
      if (this.water) this.water.reset();
      if (this.enemySystem) this.enemySystem.reset();
      if (this.asteroids) this.asteroids.reset();
      if (this.refinery) this.refinery.reset();
      if (this.combat) this.combat.clear();
      if (this.particles) this.particles.clear();
      this._won = false;
      this._missionBegun = false;
      this.isPaused = false;
      this.hasStarted = false;
      this.startGame();
    } catch (err) {
      console.error('[Game] restartGame error:', err);
    }
  }

  // ------------------------------------------------------------ Tienda

  tryOpenShop() {
    if (!this.taxi || !this.walle || !this.shop) return;
    if (this.taxi.isPlayerNear(this.walle)) {
      this.openShop();
    } else {
      const d = Math.round(this.taxi.position.distanceTo(this.walle.position));
      this.notifyOnce('shopfar', `🚕 El Taxi-Mercader está a ${d} u: sigue el marcador 🛒`, 'info', 2);
    }
  }

  openShop() {
    if (this.shopOpen || !this.shop) return;
    this.shopOpen = true;
    if (this.mobile) this.mobile.setVisible(false);
    if (this.input) {
      this.input.releaseAll();
      this.input.exitPointerLock();
    }
    audio.play('ui');
    this.shop.open(this.walle);
    this._needsRender = true;
  }

  closeShop(silent = false) {
    if (!this.shopOpen) return;
    this.shopOpen = false;
    if (this.shop && this.shop.isOpen) this.shop.close();
    if (this.input) {
      this.input.flushEvents();
      this.input.releaseAll();
    }
    if (silent) return;
    if (this.mobile && this.isPlaying) this.mobile.setVisible(this.mobile.isMobile);
    if (this.input && this.isPlaying) this.input.requestPointerLock();
  }

  // ------------------------------------------------------------ Lógica por frame

  switchWeapon(sel) {
    const w = this.walle;
    let id = null;
    if (sel === 'next') {
      const owned = WEAPON_ORDER.filter(x => w.weapons.includes(x));
      id = owned[(owned.indexOf(w.weapon) + 1) % owned.length];
    } else if (typeof sel === 'number') {
      id = WEAPON_ORDER[sel - 1];
      if (id && !w.weapons.includes(id)) {
        this.notifyOnce('locked', `🔒 ${WEAPONS[id].name}: cómpralo en el Taxi-Mercader 🚕`, 'info', 1.5);
        return;
      }
    }
    if (!id || id === w.weapon) return;
    w.weapon = id;
    const ammo = w.ammo[id];
    this.notifyOnce('weapon', `Arma: ${WEAPONS[id].icon} ${WEAPONS[id].name}${ammo === Infinity ? '' : ` (${ammo})`}`, 'info', 0);
    audio.play('ui');
  }

  /** Dirección de disparo: rayo central de la cámara con ayuda de apuntado. */
  _computeAim(weapon) {
    const cam = this.camera;
    cam.getWorldDirection(_camDir);
    const camPos = cam.position;
    const assist = this.touch ? 0.12 : (this.input && this.input.lastDevice === 'gamepad' ? 0.09 : 0.035);
    let best = null;
    let bestScore = assist;
    let bestVel = null;
    let bestDist = 0;
    const consider = (pos, radius, vel, obj) => {
      _v1.subVectors(pos, camPos);
      const d = _v1.length();
      if (d < 3 || d > 230) return;
      const cosA = _v1.dot(_camDir) / d;
      if (cosA < 0.8) return;
      const ang = Math.acos(Math.min(1, cosA)) - Math.atan(radius / d);
      if (ang < bestScore) { bestScore = ang; best = pos; bestVel = vel; bestDist = d; this._aimTarget = obj; }
    };
    this._aimTarget = null;
    if (this.enemySystem) for (const e of this.enemySystem.enemies) if (e.health > 0) consider(e.group.position, e.radius, e.velocity, e);
    if (this.asteroids) for (const a of this.asteroids.asteroids) if (a.alive) consider(a.mesh.position, a.radius, a.velocity, a);

    const w = this.walle;
    if (w.zoom < 0.15) {
      _origin.copy(camPos).addScaledVector(_camDir, 1.2);
      _origin.y -= 0.3;
    } else {
      _origin.set(0, 0.35, 1.3).applyQuaternion(w.group.quaternion).add(w.position);
    }
    if (best) {
      // Anticipación simple según la velocidad del objetivo
      const t = bestDist / Math.max(20, weapon.speed);
      _aim.copy(best).addScaledVector(bestVel, Math.min(2, t));
    } else {
      _aim.copy(camPos).addScaledVector(_camDir, 90);
    }
    _dir.subVectors(_aim, _origin).normalize();
    return { origin: _origin, dir: _dir, target: this._aimTarget };
  }

  handleShooting() {
    const w = this.walle;
    const ws = this.input.consumeWeaponSwitch();
    if (ws) this.switchWeapon(ws);
    if (!this.input.shooting) return;

    const weapon = WEAPONS[w.weapon] || WEAPONS.laser;
    const now = performance.now();
    const cadence = weapon.cadence * (w.weapon === 'laser' ? w.laserCadenceMul : 1);
    if (now - this._lastShot < cadence) return;

    const ammo = w.ammo[w.weapon];
    if (ammo !== Infinity && !(ammo > 0)) {
      this._lastShot = now;
      audio.play('error');
      this.notifyOnce('noammo', `Sin munición de ${weapon.name}: cómprala en el Taxi-Mercader 🚕`, 'danger', 2.5);
      w.weapon = 'laser';
      return;
    }
    this._lastShot = now;
    const aim = this._computeAim(weapon);
    this.combat.fire(w.weapon, aim.origin, aim.dir, {
      damageMul: w.weapon === 'laser' ? w.laserDamageMul : 1,
      target: aim.target,
    });
    if (ammo !== Infinity) w.ammo[w.weapon] = ammo - 1;
    audio.play(w.weapon);
    this.hud?.shootEffect();
  }

  handleCollection(delta) {
    const w = this.walle;
    let full = false;
    if (this.trashSystem) {
      const r = this.trashSystem.checkCollection(w);
      if (r.collected > 0) { this._pickupAgg.trash += r.collected; audio.play('pickup'); }
      full = full || r.full;
    }
    if (this.water) {
      const r = this.water.update(delta, w);
      if (r.collected > 0) { this._pickupAgg.water += r.collected; audio.play('water'); }
      full = full || r.full;
    }
    // Notificaciones agrupadas (no una por pieza)
    const agg = this._pickupAgg;
    agg.timer -= delta;
    if ((agg.trash || agg.water) && agg.timer <= 0) {
      const parts = [];
      if (agg.trash) parts.push(`+${agg.trash} basura`);
      if (agg.water) parts.push(`+${agg.water} 💧 agua`);
      this.hud?.notify(`${parts.join(' · ')} (${w.trashCount}/${w.trashCapacity})`, 'success');
      agg.trash = 0;
      agg.water = 0;
      agg.timer = 1.2;
    }
    if (full) this.notifyOnce('full', '📦 Bodega llena: deposita en una refinería ◆', 'danger', 5);
  }

  /** Acción contextual según lo que haya cerca. */
  _computeContext() {
    const w = this.walle;
    let shop = null;
    if (this.taxi && this.taxi.isPlayerNear(w)) {
      shop = { type: 'shop', key: 'ESPACIO', text: 'Abrir la tienda del Taxi-Mercader 🚕', dist: this.taxi.position.distanceTo(w.position) };
    }
    let ref = null;
    if (this.refinery) {
      const near = this.refinery.getNearest(w.position, _near);
      if (near.station && near.distance < 10) {
        const st = near.station;
        const u = st.userData;
        const pct = Math.round(u.health);
        if (!u.online) {
          ref = { type: 'repair', key: 'MANTÉN ESPACIO', text: `Reparar ${u.label} (${pct}%) — fuera de servicio`, progress: u.health / u.maxHealth, station: st };
        } else if (w.trashCount > 0) {
          ref = { type: 'deposit', key: 'ESPACIO', text: `Depositar ${w.trashCount} en ${u.label}`, station: st };
        } else if (u.health < u.maxHealth) {
          ref = { type: 'repair', key: 'MANTÉN ESPACIO', text: `Reparar ${u.label} (${pct}%)`, progress: u.health / u.maxHealth, station: st };
        }
        if (ref) ref.dist = near.distance;
      }
    }
    if (shop && ref) return shop.dist < ref.dist ? shop : ref;
    return shop || ref;
  }

  handleActions(delta) {
    const w = this.walle;
    const ctx = this._computeContext();
    this._context = ctx;
    const pressed = this.input.consumeActionPress();
    if (this.input.consumeShopRequest()) this.tryOpenShop();

    if (pressed) {
      if (ctx && ctx.type === 'shop') { this.openShop(); return; }
      if (ctx && ctx.type === 'deposit') { this._deposit(ctx.station); return; }
      if (!ctx) {
        if (w.trashCount > 0) this.notifyOnce('deposithint', 'Acércate a una refinería ◆ para depositar', 'info', 3);
        else this.notifyOnce('actionhint', 'Acércate a una refinería ◆ o al taxi 🚕 para usar ACCIÓN', 'info', 3);
      }
    }

    // Reparación (mantener acción)
    if (ctx && ctx.type === 'repair' && this.input.actionHeld && this.refinery) {
      const st = ctx.station;
      const wasOffline = !st.userData.online;
      const res = this.refinery.repair(st, w.repairRate * delta);
      audio.play('repair');
      if (this.particles && Math.random() < 0.5) {
        _v1.copy(st.position).add(_v2.set((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3));
        this.particles.hit(_v1, 0x9ff0ff, 3);
      }
      if (res === 'restored' || (res === 'repaired')) {
        const bonus = wasOffline ? 25 : 10;
        this.addCredits(bonus);
        audio.play('restored');
        this._vibrate([30, 40, 30]);
        if (wasOffline) this.hud?.alert(`🔧 ${st.userData.label} de nuevo operativa · +${bonus} CR`, 'success', 3000);
        else this.hud?.notify(`🔧 ${st.userData.label} reparada · +${bonus} CR`, 'success');
      }
    }
  }

  _deposit(station) {
    const w = this.walle;
    if (!this.refinery || !this.civilization) return;
    const dep = w.deposit();
    const refined = this.refinery.processMaterials(dep.materials, dep.count);
    this.civilization.addMaterials(refined);
    let value = 0;
    Object.values(dep.materials).forEach(v => { value += v; });
    const cr = dep.count * 3 + Math.round(value * 0.1);
    this.addCredits(cr);
    const top = Object.entries(refined).filter(([, v]) => v > 0).slice(0, 3)
      .map(([k, v]) => `${(MATERIALS[k] && MATERIALS[k].icon) || ''}${v}`).join(' ');
    this.hud?.notify(`✔ ${dep.count} depositadas en ${station.userData.label} · +${cr} CR · ${top}`, 'success');
    if (this.particles) this.particles.explosion(station.position, 0x00f0ff, 1.0);
    audio.play('deposit');
    this._vibrate(25);
  }

  _computeObjective() {
    const w = this.walle;
    if (this.tutorial && this.tutorial.active) return '';
    const a = this.asteroids;
    if (a && a.waveActive && a.waveTarget) {
      const n = a.asteroids.length + a.toSpawn;
      return `☄️ Defiende la ${a.waveTarget.userData.label}: ${n} asteroide${n === 1 ? '' : 's'}`;
    }
    const off = this.refinery ? this.refinery.countDamaged() : 0;
    if (off > 0) return `🔧 ${off} refinería${off === 1 ? '' : 's'} fuera de servicio: ve y mantén ACCIÓN para repararla${off === 1 ? '' : 's'}`;
    if (w.trashCount >= w.trashCapacity) return '📦 Bodega llena: deposita en una refinería ◆';
    if (a && a.enabled && a.timeToNextWave < 15) return `⚠️ Lluvia de asteroides en ${Math.ceil(a.timeToNextWave)} s`;
    if (w.trashCount >= w.trashCapacity * 0.6) return `Lleva la carga a una refinería ◆ (${w.trashCount}/${w.trashCapacity})`;
    return 'Recoge basura 🗑 y agua 💧 (abunda cerca de la Tierra)';
  }

  _updateIdleCamera(delta) {
    this._idleAngle += delta * 0.05;
    const r = 75;
    _v1.set(Math.sin(this._idleAngle) * r, 22 + Math.sin(this._idleAngle * 0.5) * 6, Math.cos(this._idleAngle) * r);
    this.camera.position.lerp(_v1, Math.min(1, delta * 2));
    this.camera.lookAt(0, 0, 0);
  }

  _updateGame(delta, elapsed) {
    const w = this.walle;
    const input = this.input;

    // Cámara: rueda (PC), botón 👁 / V / Y (4 distancias), C (1ª/3ª)
    if (input.consumeCameraToggle()) {
      w.toggleCameraMode();
      this.hud?.showZoom(w.zoomTarget, w.zoomTarget > 0.5 ? 'Tercera persona' : 'Primera persona');
    }
    if (input.consumeZoomCycle()) {
      const idx = w.cycleZoomPreset();
      this.hud?.showZoom(w.zoomTarget, CAMERA_PRESET_NAMES[idx]);
    }
    const zd = input.consumeZoomDelta();
    if (zd) {
      const z = w.addZoom(zd);
      this.hud?.showZoom(z, z >= 0.99 ? 'Tercera persona' : z <= 0.01 ? 'Primera persona' : 'Distancia');
    }

    w.update(delta, input, this.solarSystem);
    if (this.solarSystem) this.solarSystem.update(delta, elapsed);
    if (this.trashSystem) this.trashSystem.update(delta, w.position, w);
    if (this.enemySystem) this.enemySystem.update(delta, w, this.combat);
    if (this.refinery) this.refinery.update(delta);
    if (this.asteroids) this.asteroids.update(delta, w);
    if (this.taxi) {
      if (this.tutorial && this.tutorial.active) this.taxi.stateTime = 0;
      this.taxi.update(delta, w, this.camera);
    }
    if (this.combat) {
      this.combat.update(delta, {
        walle: w, enemySystem: this.enemySystem, asteroidSystem: this.asteroids, trashSystem: this.trashSystem,
      });
    }
    if (this.enemySystem) this.enemySystem.checkPlayerCollision(w);

    this.handleShooting();
    this.handleCollection(delta);
    this.handleActions(delta);
    if (this.shopOpen) return; // se acaba de abrir la tienda

    // Tutorial: auto-avance de los pasos de mover y mirar
    if (this.tutorial && this.tutorial.active) {
      const rd = this._realDelta || delta;
      if (Math.abs(input.moveX) + Math.abs(input.moveY) > 0.3) this.tutorial.report('move', rd / 1.2);
      if (Math.abs(input.lookX) + Math.abs(input.lookY) > 0.25 || Math.abs(input.lookDeltaX) + Math.abs(input.lookDeltaY) > 0.002) {
        this.tutorial.report('look', rd / 1.0);
      }
    }

    if (w.overheating) this.notifyOnce('heat', '🔥 ¡Calor extremo! Aléjate del sol', 'danger', 2.5);

    // Viñeta roja al recibir daño (cualquier fuente)
    const lost = this._lastHealth - w.health;
    if (lost > 0.5 && this.hud) this.hud.flashDamage(lost);
    this._lastHealth = w.health;

    if (this.mobile) {
      this.mobile.setActionContext(this._context);
      const def = WEAPONS[w.weapon];
      this.mobile.setWeaponLabel(def ? def.short : '');
    }

    this._objTimer -= delta;
    if (this._objTimer <= 0) {
      this._objTimer = 0.25;
      this._objective = this._computeObjective();
    }

    if (this.hud) {
      this.hud.update({
        walle: w, solarSystem: this.solarSystem, trashSystem: this.trashSystem, refinery: this.refinery,
        enemySystem: this.enemySystem, asteroidSystem: this.asteroids, taxi: this.taxi, water: this.water,
        camera: this.camera, context: this._context, objective: this._objective,
      }, delta);
    }

    if (w.health <= 0) {
      if (this.particles) this.particles.explosion(w.position, 0xffaa00, 1.6);
      audio.play('explosion');
      this._vibrate([200, 80, 200]);
      const lostCargo = w.trashCount;
      w.trashCount = 0;
      Object.keys(w.materials).forEach(k => { w.materials[k] = 0; });
      this._placeWalleAtStart();
      w.respawn();
      this._lastHealth = w.health;
      this.hud?.alert(`💥 ¡WALL·E destruido!${lostCargo ? ` Pierdes ${lostCargo} de carga.` : ''} Reapareces junto a la Tierra`, 'danger', 3500);
    }

    if (this.civilization && !this._won) {
      const prog = this.civilization.getProgress();
      if (prog.percent >= 100) {
        this._won = true;
        this.hud?.alert('🌌 ¡FELICIDADES! Has civilizado todo el sistema solar', 'success', 8000);
      }
    }
  }

  animate() {
    requestAnimationFrame(this.animate);
    try {
      const rawDelta = this.clock.getDelta();
      const delta = Math.min(rawDelta, 0.05);
      // Tiempo real (para el tutorial): no depende del límite de delta a pocos FPS
      this._realDelta = Math.min(rawDelta, 0.2);
      const elapsed = this.clock.elapsedTime;

      if (this.input) this.input.update();
      if (this.adaptive && (this.isPlaying || !this.hasStarted)) this.adaptive.update();

      if (this.input && this.input.consumePause()) {
        const sinceChange = performance.now() - (this._lastStateChange || 0);
        if (this.shopOpen) this.closeShop();
        else if (sinceChange > 400) {
          if (this.isPlaying) this.pauseGame();
          else if (this.isPaused) this.resumeGame();
        }
      }

      let render = false;
      if (this.isPlaying && !this.shopOpen) {
        if (this.walle && this.input) this._updateGame(delta, elapsed);
        render = true;
      } else if (!this.hasStarted) {
        // Menú inicial: el sistema solar gira de fondo y la cámara orbita el sol
        if (this.solarSystem) this.solarSystem.update(delta, elapsed);
        if (this.refinery) this.refinery.update(delta);
        if (this.water) this.water.update(delta, null);
        this._updateIdleCamera(delta);
        render = true;
      }
      if (render && this.particles) this.particles.update(delta, this.camera, this.renderer);

      // En pausa / tienda la escena está congelada: no se vuelve a dibujar
      // (ahorra batería en móvil) salvo que cambie el tamaño o la calidad.
      if ((render || this._needsRender) && this.renderer && this.scene && this.camera) {
        this._needsRender = false;
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
