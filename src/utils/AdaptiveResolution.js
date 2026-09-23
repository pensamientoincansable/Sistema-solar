/**
 * Adaptive Resolution - Optimización para Móvil / PC / TV
 * Ajusta dinámicamente pixel ratio, sombras, post-procesado según rendimiento y dispositivo
 */
export class AdaptiveResolution {
  constructor(renderer) {
    this.renderer = renderer;
    this.basePixelRatio = window.devicePixelRatio || 1;
    this.currentRatio = this.basePixelRatio;
    this.targetFPS = 60;
    this.fpsHistory = [];
    this.lastTime = performance.now();
    this.frameCount = 0;
    this.qualityLevel = 2; // 0 low, 1 medium, 2 high, 3 ultra
    this.deviceType = this.detectDevice();
    this.initQuality();
    window.addEventListener('resize', () => this.onResize());
  }

  detectDevice() {
    const ua = navigator.userAgent.toLowerCase();
    const width = window.innerWidth;
    const height = window.innerHeight;
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isTV = (width >= 1920 && height >= 1080 && !isTouch) || ua.includes('tv') || ua.includes('smart-tv') || window.matchMedia('(display-mode: fullscreen)').matches && width > 1920;

    if (isTV || (width >= 3840)) return 'tv';
    if (isTouch && width <= 1024) return 'mobile';
    if (width <= 1366 && isTouch) return 'tablet';
    return 'pc';
  }

  initQuality() {
    switch(this.deviceType) {
      case 'mobile':
        this.qualityLevel = 0;
        this.currentRatio = Math.min(1.5, this.basePixelRatio);
        this.targetFPS = 30;
        break;
      case 'tablet':
        this.qualityLevel = 1;
        this.currentRatio = Math.min(1.8, this.basePixelRatio);
        break;
      case 'tv':
        this.qualityLevel = 3;
        this.currentRatio = Math.min(1.0, this.basePixelRatio); // TV already 4K, reduce ratio to save GPU
        this.targetFPS = 60;
        break;
      default: // pc
        this.qualityLevel = 2;
        this.currentRatio = Math.min(2.0, this.basePixelRatio);
    }
    this.apply();
  }

  apply() {
    this.renderer.setPixelRatio(this.currentRatio);
    // Ajustar sombras según calidad
    if (this.qualityLevel <= 0) {
      this.renderer.shadowMap.enabled = false;
    } else {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = this.qualityLevel >= 2 ? 2 : 1; // PCFSoft vs Basic
    }
    console.log(`[Adaptive] Device: ${this.deviceType} | Quality: ${this.qualityLevel} | DPR: ${this.currentRatio}`);
  }

  update() {
    const now = performance.now();
    this.frameCount++;
    if (now - this.lastTime >= 1000) {
      const fps = Math.round((this.frameCount * 1000) / (now - this.lastTime));
      this.fpsHistory.push(fps);
      if (this.fpsHistory.length > 10) this.fpsHistory.shift();
      const avgFps = this.fpsHistory.reduce((a,b)=>a+b,0)/this.fpsHistory.length;

      // Auto ajustar si FPS bajo
      if (avgFps < this.targetFPS - 10 && this.currentRatio > 0.6) {
        this.currentRatio = Math.max(0.6, this.currentRatio - 0.15);
        this.apply();
      } else if (avgFps > this.targetFPS + 5 && this.currentRatio < this.basePixelRatio) {
        this.currentRatio = Math.min(this.basePixelRatio, this.currentRatio + 0.05);
        this.apply();
      }

      this.frameCount = 0;
      this.lastTime = now;
      return fps;
    }
    return null;
  }

  onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    // Recalcular device si cambia mucho
    const newType = this.detectDevice();
    if (newType !== this.deviceType) {
      this.deviceType = newType;
      this.initQuality();
    }
    // El renderer size se maneja en Game.js
  }

  getQualitySettings() {
    return {
      deviceType: this.deviceType,
      qualityLevel: this.qualityLevel,
      pixelRatio: this.currentRatio,
      shadows: this.qualityLevel > 0,
      postProcessing: this.qualityLevel >= 2,
      particleCount: [200, 600, 1200, 2000][this.qualityLevel],
      trashCount: [40, 80, 150, 200][this.qualityLevel],
      enemyCount: [4, 8, 12, 16][this.qualityLevel],
      renderDistance: [400, 800, 1500, 2500][this.qualityLevel]
    };
  }
}
