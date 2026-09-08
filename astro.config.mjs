// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // Dirección pública del sitio. Se usa para armar las direcciones absolutas
  // de la vista previa al compartir el enlace (WhatsApp, Instagram, etc.),
  // que no admiten rutas relativas.
  site: 'https://babyshower.ginorojoj.workers.dev',

  integrations: [react()],

  vite: {
    plugins: [tailwindcss()]
  }
});