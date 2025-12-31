import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: [
            'pwa-192x192.svg',
            'pwa-512x512.svg',
            '**/*.png',
            '**/*.jpg',
            '**/*.jpeg',
            '**/*.webp',
            '**/*.gif',
            '**/*.svg',
          ],
          manifest: {
            name: '僵尸公路幸存者',
            short_name: '幸存者',
            start_url: '/',
            scope: '/',
            display: 'standalone',
            background_color: '#0a0a0a',
            theme_color: '#0a0a0a',
            icons: [
              {
                src: '/pwa-192x192.svg',
                sizes: '192x192',
                type: 'image/svg+xml',
              },
              {
                src: '/pwa-512x512.svg',
                sizes: '512x512',
                type: 'image/svg+xml',
              },
            ],
          },
          workbox: {
            cleanupOutdatedCaches: true,
            clientsClaim: true,
            skipWaiting: true,
            runtimeCaching: [
              {
                urlPattern: ({ request }) => request.destination === 'image',
                handler: 'StaleWhileRevalidate',
                options: {
                  cacheName: 'images',
                  expiration: {
                    maxEntries: 200,
                    maxAgeSeconds: 60 * 60 * 24 * 30,
                  },
                },
              },
            ],
          },
        }),
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
