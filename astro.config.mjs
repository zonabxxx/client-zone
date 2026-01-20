// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone'
  }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      exclude: ['better-sqlite3']
    },
    server: {
      hmr: {
        // Disable full page reload on server file changes
        overlay: false
      },
      watch: {
        // Ignore db.ts changes to prevent constant reloads
        ignored: ['**/node_modules/**', '**/.git/**']
      }
    }
  }
});
