/**
 * Azure login guard — checks if the user is logged into Azure CLI.
 *
 * Used by E2E tests that need to hit real Azure services (not mocks).
 * Tests that only use mock-backed stacks don't need this.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Check if the Azure CLI is logged in.
 * Returns true if `az account show` succeeds, false otherwise.
 */
export async function isAzureLoggedIn(): Promise<boolean> {
  try {
    await execFileAsync('az', ['account', 'show', '--query', 'id', '-o', 'tsv']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Require Azure CLI login — throws with a clear message if not logged in.
 * Call this in beforeAll() for test files that need Azure credentials.
 */
export async function requireAzureLogin(): Promise<void> {
  const loggedIn = await isAzureLoggedIn();
  if (!loggedIn) {
    throw new Error(
      'Azure CLI not logged in. Run `az login` first.\n' +
        'This test requires Azure credentials to access real Azure services.\n' +
        'If you want to run tests against mocks only, set E2E_USE_MOCKS=true.'
    );
  }
}
