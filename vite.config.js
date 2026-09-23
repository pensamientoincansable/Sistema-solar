import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    cors: true,
    hmr: {
      host: 'localhost'
    },
    // Allow all hosts for Arena preview
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 5173
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'esbuild'
  },
  assetsInclude: ['**/*.gltf', '**/*.bin', '**/*.jpeg', '**/*.png']
});
