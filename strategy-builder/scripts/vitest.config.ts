import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 60_000, // clone tests need network access
    hookTimeout: 30_000
  }
});
