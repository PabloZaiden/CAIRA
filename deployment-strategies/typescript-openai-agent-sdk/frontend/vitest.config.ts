import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 5_000,
    hookTimeout: 10_000,
    include: ['tests/**/*.test.{ts,tsx}']
  }
});
