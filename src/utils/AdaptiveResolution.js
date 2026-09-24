import { isTouchUI } from './device.js';

/**
 * Adaptive Resolution - Optimización para Móvil / PC / TV
 * Ajusta dinámicamente el pixel ratio según rendimiento y dispositivo.
 * (Las sombras ya no se alternan: ninguna luz las proyecta y cambiar
 * shadowMap.enabled obligaba a recompilar todos los materiales.)
 */
export class AdaptiveResolution {
  constructor(renderer) {
    this.renderer = renderer;
    this.basePixelRatio = window.devicePixelRatio || 1;
    this.currentRatio = this.basePixelRatio;
    this.maxRatio = this.basePixelRatio;
    this.targetFPS = 60;
    this.fpsHistory = [];
    this.lastTime = performance.now();
    this.frameCount = 0;
    this.qualityLevel = 2; // 0 low, 1 medium, 2 high, 3 ultra
    this.auto = true;
    this.deviceType = this.detectDevice();
    this.initQuality();
    window.addEventListener('resize', () => this.onResize());
  }

  detectDevice() {
    const ua = (navigator.userAgent || '').toLowerCase();
    const width = window.innerWidth;
    const isTouch = isTouchUI();
    const isTVUA = /smart-tv|smarttv|tizen|webos|hbbtv|netcast|viera|googletv|android tv|bravia|appletv|crkey/.test(ua);

    // Un monitor 1080p de PC NO es una TV: solo UA de TV o pantallas 4K sin táctil.
    if (isTVUA || (width >= 3840 && !isTouch)) return 'tv';
    if (isTouch && width <= 1024) return 'mobile';
    if (isTouch) return 'tablet';
    return 'pc';
  }

  initQuality() {
    switch (this.deviceType) {
      case 'mobile':
        this.qualityLevel = 0;
        this.maxRatio = Math.min(1.5, this.basePixelRatio);
        this.targetFPS = 30;
        break;
      case 'tablet':
        this.qualityLevel = 1;
        this.maxRatio = Math.min(1.8, this.basePixelRatio);
        this.targetFPS = 30;
        break;
      case 'tv':
        this.qualityLevel = 3;
        this.maxRatio = Math.min(1.0, this.basePixelRatio); // 4K: DPR 1 ya es mucho
        this.targetFPS = 60;
        break;
      default: // pc
        this.qualityLevel = 2;
        this.maxRatio = Math.min(2.0, this.basePixelRatio);
        this.targetFPS = 60;
    }
    this.currentRatio = this.maxRatio;
    this.apply();
  }

  /** Fija manualmente el nivel de calidad (0-3) y desactiva el ajuste automático. */
  setQualityLevel(level) {
    this.auto = false;
    this.qualityLevel = Math.max(0, Math.min(3, level | 0));
    this.maxRatio = [1.0, 1.5, 2.0, Math.max(1.0, Math.min(2.0, this.basePixelRatio))][this.qualityLevel];
    this.maxRatio = Math.min(this.maxRatio, this.basePixelRatio);
    this.currentRatio = this.maxRatio;
    this.fpsHistory = [];
    this.apply();
  }

  /** Vuelve al modo automático (según dispositivo + FPS). */
  setAuto() {
    this.auto = true;
    this.deviceType = this.detectDevice();
    this.fpsHistory = [];
    this.initQuality();
  }

  apply() {
    this.renderer.setPixelRatio(this.currentRatio);
    if (this.onChange) { try { this.onChange(); } catch (e) { /* noop */ } }
    console.log(`[Adaptive] Device: ${this.deviceType} | Quality: ${this.qualityLevel} | DPR: ${this.currentRatio.toFixed(2)} | auto: ${this.auto}`);
  }

  update() {
    const now = performance.now();
    this.frameCount++;
    if (now - this.lastTime >= 1000) {
      const fps = Math.round((this.frameCount * 1000) / (now - this.lastTime));
      this.fpsHistory.push(fps);
      if (this.fpsHistory.length > 5) this.fpsHistory.shift();
      const avgFps = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;

      // Ajuste dinámico del pixel ratio según FPS (solo en modo auto y con historial suficiente)
      if (this.auto && this.fpsHistory.length >= 3) {
        if (avgFps < this.targetFPS - 10 && this.currentRatio > 0.6) {
          this.currentRatio = Math.max(0.6, this.currentRatio - 0.15);
          this.apply();
          this.fpsHistory = [];
        } else if (avgFps >= this.targetFPS - 2 && this.currentRatio < this.maxRatio) {
          this.currentRatio = Math.min(this.maxRatio, this.currentRatio + 0.05);
          this.apply();
        }
      }

      this.frameCount = 0;
      this.lastTime = now;
      return fps;
    }
    return null;
  }

  onResize() {
    if (!this.auto) return;
    const newType = this.detectDevice();
    if (newType !== this.deviceType) {
      this.deviceType = newType;
      this.initQuality();
    }
  }

  getQualitySettings() {
    return {
      deviceType: this.deviceType,
      qualityLevel: this.qualityLevel,
      pixelRatio: this.currentRatio,
      shadows: false,
      postProcessing: false,
      particleCount: [200, 600, 1200, 2000][this.qualityLevel],
      particleMax: [320, 500, 800, 1000][this.qualityLevel],
      trashCount: [45, 80, 150, 200][this.qualityLevel],
      waterCount: [40, 60, 90, 110][this.qualityLevel],
      enemyCount: [4, 6, 9, 12][this.qualityLevel],
      asteroidsPerWave: [3, 4, 5, 6][this.qualityLevel],
      renderDistance: [400, 800, 1500, 2500][this.qualityLevel],
      lowresTextures: this.qualityLevel <= 1
    };
  }
}
