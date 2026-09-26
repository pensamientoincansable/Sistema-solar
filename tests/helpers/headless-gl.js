/**
 * Entorno de test sin navegador real: contexto 2D mínimo y contexto WebGL
 * falsificado para que `new Game(canvas)` (y por tanto `new THREE.WebGLRenderer`)
 * funcione en Node/jsdom. three.js solo lee capacidades y dibuja a no-ops.
 */
export function installHeadlessGraphics() {
  const gradient = { addColorStop() {} };
  const ctx2dStub = () => ({
    createRadialGradient: () => gradient,
    createLinearGradient: () => gradient,
    fillRect() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
    moveTo() {}, lineTo() {}, quadraticCurveTo() {}, bezierCurveTo() {}, closePath() {},
    fillText() {}, strokeText() {},
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h) * 4), width: w, height: h }),
    putImageData() {}, scale() {}, translate() {}, rotate() {}, save() {}, restore() {},
    measureText: () => ({ width: 0 }),
  });

  const glConst = (name) => {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return h & 0x7fffffff;
  };
  const makeGL = () => {
    const special = {
      getParameter: (p) => {
        if (p === glConst('VERSION')) return 'WebGL 2.0 (OpenGL ES 3.0 Chromium)';
        if (p === glConst('SHADING_LANGUAGE_VERSION')) return 'WebGL GLSL ES 3.00';
        if (p === glConst('MAX_VIEWPORT_DIMS')) return [8192, 8192];
        if (p === glConst('MAX_TEXTURE_SIZE')) return 8192;
        return 16;
      },
      getShaderPrecisionFormat: () => ({ range: 117, precision: 15 }),
      getExtension: () => null,
      getSupportedExtensions: () => [],
      isContextLost: () => false,
      checkFramebufferStatus: () => 36048, // FRAMEBUFFER_COMPLETE
      getProgramParameter: () => true,
      getShaderParameter: () => true,
      getProgramInfoLog: () => '',
      getShaderInfoLog: () => '',
      getUniformLocation: () => null,
      getAttribLocation: () => -1,
      createShader: () => ({}),
      createProgram: () => ({}),
      createBuffer: () => ({}),
      createTexture: () => ({}),
      createFramebuffer: () => ({}),
      createRenderbuffer: () => ({}),
      createQuery: () => ({}),
      createSampler: () => ({}),
      createVertexArray: () => ({}),
      createTransformFeedback: () => ({}),
      getActiveUniform: () => ({ type: 0x8B58, size: 1, name: 'u' }),
      getActiveAttrib: () => ({ type: 0x8B58, size: 1, name: 'a' }),
      getUniform: () => null,
      getUniforms: () => [],
      getVertexAttrib: () => null,
      getBufferParameter: () => 0,
    };
    return new Proxy({}, {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (prop in special) return special[prop];
        if (typeof prop === 'string' && /^[A-Z0-9_]+$/.test(prop)) return glConst(prop);
        return () => {};
      },
      set() { return true; },
    });
  };

  globalThis.window.HTMLCanvasElement.prototype.getContext = function (kind) {
    if (kind === '2d') {
      if (!this.__ctx2d) { this.__ctx2d = ctx2dStub(); this.__ctx2d.canvas = this; }
      return this.__ctx2d;
    }
    if (!this.__gl) this.__gl = makeGL();
    return this.__gl;
  };

  // Sin servidor de assets: las cargas de GLB/texturas quedan pendientes
  // para siempre (nunca rechazan: las promesas sin gestionar harían fallar
  // al ejecutor de tests como actividad asíncrona post-test).
  globalThis.fetch = () => new Promise(() => {});
}
