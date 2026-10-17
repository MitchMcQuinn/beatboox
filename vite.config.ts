import { build } from 'esbuild'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig, type Plugin } from 'vite'
import { resolve } from 'node:path'

function audioWorklet(): Plugin {
  const entry = resolve('src/audio/worklet/processor.ts')
  const outfile = resolve('public/pitch-processor.js')
  const bundle = () =>
    build({
      entryPoints: [entry],
      outfile,
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
    })

  return {
    name: 'audio-worklet',
    async buildStart() {
      await bundle()
    },
    configureServer(server) {
      const audioDir = resolve('src/audio')
      server.watcher.on('change', (file) => {
        if (file.startsWith(audioDir)) void bundle()
      })
    },
  }
}

const pagesBase = process.env.GITHUB_PAGES === 'true' ? '/beatboox/' : '/'

export default defineConfig({
  base: pagesBase,
  plugins: [
    react(),
    tailwindcss(),
    audioWorklet(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'pitch-processor.js'],
      manifest: {
        name: 'Beatboox',
        short_name: 'Beatboox',
        description: 'Sing, hum, or beatbox into MIDI.',
        theme_color: '#0c0d0f',
        background_color: '#0c0d0f',
        display: 'standalone',
        categories: ['music'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  server: {
    host: true,
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
})
