import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue(), basicSsl()],
  resolve: {
    alias: {
      // pose-detection.esm.js has static imports for both of these packages even
      // when using MoveNet on WebGL.  Both are unused at runtime (all call sites
      // are guarded by `backend instanceof WebGPUBackend` / BlazePose checks).
      // Aliasing to stubs avoids Vite trying to bundle the real CJS/missing pkgs.
      '@mediapipe/pose': fileURLToPath(new URL('./src/mocks/mediapipe-pose.ts', import.meta.url)),
      '@tensorflow/tfjs-backend-webgpu': fileURLToPath(new URL('./src/mocks/tfjs-backend-webgpu.ts', import.meta.url)),
    },
  },
  optimizeDeps: {
    // TF.js ESM bundles must not be pre-bundled — esbuild can't handle their
    // dynamic require() calls and would produce "Duplicate backend" errors.
    exclude: ['@tensorflow/tfjs', '@tensorflow-models/pose-detection'],
    // These are pure-CJS packages imported by the excluded TF.js bundles.
    // Force esbuild to pre-bundle them (CJS → ESM) so the browser can
    // import them as named/namespace ES modules.
    include: ['long', 'seedrandom'],
  },
})
