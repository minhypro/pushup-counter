import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    vue(),
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'AI Push-up Counter',
        short_name: 'Push-ups',
        description: 'Real-time AI push-up counter using pose detection',
        theme_color: '#09090b',
        background_color: '#09090b',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.hostname === 'tfhub.dev' || url.hostname.endsWith('.tfhub.dev'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'tfhub-models',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.hostname === 'cdn.jsdelivr.net',
            handler: 'CacheFirst',
            options: {
              cacheName: 'jsdelivr-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.hostname === 'storage.googleapis.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'gcs-models',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
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
