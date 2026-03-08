import { defineConfig } from 'vitest/config';

const mockMode = process.env['E2E_MOCK_MODE'] === 'true';

export default defineConfig({
  test: {
    // Real Azure-backed flows can legitimately take longer than the default
    // Vitest timeout, especially when the first shanty conversation creates
    // the backing Foundry conversation and agent response.
    testTimeout: mockMode ? 30_000 : 120_000,
    hookTimeout: mockMode ? 15_000 : 30_000
  }
});
