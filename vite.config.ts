import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
  bench: {
    include: ['src/**/*.bench.ts'],
  },
});
