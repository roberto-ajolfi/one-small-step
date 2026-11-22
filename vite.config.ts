import react from '@vitejs/plugin-react';
import autoprefixer from 'autoprefixer';
import tailwindcss from 'tailwindcss';
import { defineConfig } from 'vitest/config';

// Vite builds and serves the web app (spec §2) and runs the test suite through
// the same config (spec §9). Tailwind is wired as a PostCSS plugin inline so the
// repo keeps one config surface (`tailwind.config.ts` holds the theme tokens).
export default defineConfig({
  plugins: [react()],
  css: {
    postcss: { plugins: [tailwindcss(), autoprefixer()] },
  },
  build: {
    target: 'es2022',
    // Spec §10: web bundle < 1 MB gzipped — no code-splitting needed at this size.
    chunkSizeWarningLimit: 1000,
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
  },
});
