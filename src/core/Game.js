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

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x000000, 0.0012);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 3000);
    this.camera.position.set(0, 20, -40);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.textureLoader = new THREE.TextureLoader();
    this.textureLoader.setPath('/');

    this.clock = new THREE.Clock();
    this.isPlaying = false;
    this.isPaused = false;

    // Sistemas
    this.input = new InputSystem(canvas);
    this.adaptive = new AdaptiveResolution(this.renderer);
    this.quality = this.adaptive.getQualitySettings();

    this.solarSystem = new SolarSystem(this.scene, this.textureLoader);
    this.walle = new WallE(this.scene, this.camera);
    this.trashSystem = new TrashSystem(this.scene, this.solarSystem, this.quality);
    this.combat = new CombatSystem(this.scene);
    this.enemySystem = new EnemySystem(this.scene, this.solarSystem, this.trashSystem, this.quality);
    this.refinery = new Refinery(this.scene, this.solarSystem);
    this.civilization = new CivilizationManager(this.solarSystem);

    this.hud = new HUD();
    this.menu = new HoloMenu(this);
    this.mobile = new MobileControls(this.input);

    // Luz adicional para WALL-E
    const hemi = new THREE.HemisphereLight(0x606060, 0x202030, 0.8);
    this.scene.add(hemi);

    this.civilization.onUpdate = () => {
      this.menu.updateMaterials();
    };

    this.bindEvents();
    this.animate = this.animate.bind(this);

    // Loading ocultar
    setTimeout(()=> {
      const loader = document.getElementById('loading-screen');
      if (loader) {
        loader.classList.add('hidden');
        setTimeout(()=> loader.style.display='none', 800);
      }
    }, 1200);

    requestAnimationFrame(this.animate);
    console.log('[Game] Inicializado - Calidad:', this.quality);
  }

  bindEvents() {
    window.addEventListener('resize', ()=> {
      this.camera.aspect = window.innerWidth/window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.quality = this.adaptive.getQualitySettings();
    });

    // Pausa con ESC
    window.addEventListener('keydown', e=> {
      if (e.code === 'Escape') {
        if (this.isPlaying) this.pauseGame();
      }
      if (e.code === 'KeyP') {
        if (this.isPlaying) this.pauseGame();
      }
    });
  }

  startGame() {
    this.isPlaying = true;
    this.isPaused = false;
    this.clock.start();
    this.menu.hide();
    this.hud.show();
    this.menu.setContinueVisible(true);
    this.hud.notify('¡Misión iniciada! Recolecta basura espacial', 'success');
    this.hud.notify('WASD mover | Ratón mirar | Click disparar | C cambiar cámara | ESPACIO depositar', 'info');
    this.canvas.focus();
  }

  pauseGame() {
    this.isPlaying = false;
    this.isPaused = true;
    this.menu.show();
    this.hud.hide();
    document.exitPointerLock?.();
  }

  resumeGame() {
    if (!this.isPaused) return;
    this.isPlaying = true;
    this.isPaused = false;
    this.menu.hide();
    this.hud.show();
  }

  handleShooting() {
    if (!this.isPlaying) return;
    if (this.input.shooting) {
      const now = performance.now();
      if (!this._lastShoot || now - this._lastShoot > (this.walle.weapon==='laser'? 150 : 400)) {
        this._lastShoot = now;
        const origin = this.walle.position.clone().add(new THREE.Vector3(0,0.8,2).applyQuaternion(this.walle.group.quaternion));
        const dir = new THREE.Vector3(0,0,1).applyQuaternion(this.walle.group.quaternion);
        // Si hay crosshair central, disparar hacia adelante de cámara
        if (this.walle.cameraMode === 'first') {
          // usar cámara forward
          const camDir = new THREE.Vector3();
          this.camera.getWorldDirection(camDir);
          this.combat.shoot(origin, camDir, this.walle.weapon, 'player');
        } else {
          this.combat.shoot(origin, dir, this.walle.weapon, 'player');
        }
        if (this.walle.weapon === 'plasma' && this.walle.ammo.plasma >0) {
          this.walle.ammo.plasma--;
        }
        if (this.walle.weapon === 'plasma' && this.walle.ammo.plasma <=0) {
          this.walle.weapon = 'laser';
          this.hud.notify('Plasma agotado, cambiando a láser', 'danger');
        }
        this.hud.shootEffect();
      }
    }

    const ws = this.input.consumeWeaponSwitch();
    if (ws===1) { this.walle.weapon='laser'; this.hud.notify('Arma: LÁSER', 'info'); }
    if (ws===2) {
      if (this.walle.ammo.plasma>0) { this.walle.weapon='plasma'; this.hud.notify('Arma: PLASMA', 'info'); }
      else this.hud.notify('Sin munición de plasma', 'danger');
    }
  }

  handleCollection() {
    if (!this.isPlaying) return;
    // Auto recolectar si cerca
    const collected = this.trashSystem.checkCollection(this.walle, 4.5);
    if (collected>0) {
      this.hud.notify(`+${collected} basura recolectada (${this.walle.trashCount}/${this.walle.trashCapacity})`, 'success');
    }

    // Depositar en refinería
    if (this.input.collect) {
      const station = this.refinery.checkDeposit(this.walle);
      if (station) {
        const dep = this.walle.deposit();
        const refined = this.refinery.processMaterials(dep.materials, dep.count);
        this.civilization.addMaterials(refined);
        this.hud.notify(`Depositado ${dep.count} unidades en ${station.userData.id}. Materiales refinados!`, 'success');
        // Efecto
        this.combat.createExplosion(station.position, 0x00f0ff, 1.2);
        this.input.collect = false; // consumir
      }
    }
  }

  animate() {
    requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.elapsedTime;

    this.input.update();
    this.mobile.update();

    const fps = this.adaptive.update();

    if (this.input.consumeCameraToggle()) {
      const mode = this.walle.toggleCameraMode();
      this.hud.notify(`Cámara: ${mode === 'third' ? 'Tercera persona' : 'Primera persona'}`, 'info');
    }

    if (this.isPlaying) {
      this.walle.update(delta, this.input, this.solarSystem);
      this.solarSystem.update(delta, elapsed);
      this.trashSystem.update(delta, this.walle.position);
      this.enemySystem.update(delta, this.walle, this.combat);
      this.refinery.update(delta);
      this.combat.update(delta, this.walle, this.enemySystem, this.trashSystem);
      this.enemySystem.checkPlayerCollision(this.walle, this.combat);

      this.handleShooting();
      this.handleCollection();

      this.hud.update(this.walle, this.solarSystem, this.trashSystem, this.civilization, this.refinery, delta);

      // Game over?
      if (this.walle.health <=0) {
        this.hud.notify('¡WALL·E destruido! Reiniciando...', 'danger');
        this.walle.health = this.walle.maxHealth;
        this.walle.position.set(0,0,80);
        this.walle.velocity.set(0,0,0);
      }

      // Victoria?
      const prog = this.civilization.getProgress();
      if (prog.percent >= 100 && !this._won) {
        this._won = true;
        this.hud.notify('¡FELICIDADES! Has civilizado todo el sistema solar 🌌', 'success');
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}
