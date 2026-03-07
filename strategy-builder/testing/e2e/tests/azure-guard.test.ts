/**
 * Unit tests for the azure-guard helper.
 *
 * These tests verify the utility functions work correctly.
 * Note: actual Azure login state varies by environment.
 */

import { describe, it, expect } from 'vitest';
import { isAzureLoggedIn, requireAzureLogin } from '../src/helpers/azure-guard.ts';

describe('azure-guard', () => {
  describe('isAzureLoggedIn', () => {
    it('returns a boolean', async () => {
      const result = await isAzureLoggedIn();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('requireAzureLogin', () => {
    it('either succeeds or throws with a clear message', async () => {
      try {
        await requireAzureLogin();
        // If it doesn't throw, Azure CLI is logged in — that's fine
      } catch (err: unknown) {
        // If it throws, verify the message is helpful
        expect(err).toBeInstanceOf(Error);
        const error = err as Error;
        expect(error.message).toContain('Azure CLI not logged in');
        expect(error.message).toContain('az login');
      }
    });
  });
});
