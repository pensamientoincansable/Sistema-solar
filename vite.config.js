import { defineConfig } from 'vite';

export default defineConfig({
  // Base relativa: el build funciona tanto en la raíz de un dominio como en
  // un subdirectorio (GitHub Pages sirve el proyecto en /Sistema-solar/).
  // En desarrollo Vite sigue sirviendo desde '/'.
  base: './',
  // Assets estáticos (texturas, modelo GLTF) que se copian tal cual a dist/
  publicDir: 'public',
  server: {
    host: '0.0.0.0',
    port: 5173,
    cors: true,
    // Permitir cualquier host (previews tipo https://5173-xxx.e2b.app).
    // No fijamos hmr.host: el cliente infiere el host/puerto desde la URL de
    // la página, que es lo que funciona detrás de un proxy.
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'esbuild',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Three.js en su propio chunk para cachearlo de forma independiente
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
});
