import { defineConfig } from 'vitest/config';

// Vitest is configured through Vite (spec §2): unit + integration tests under tests/.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
