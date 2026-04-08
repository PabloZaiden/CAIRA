#!/usr/bin/env node
/**
 * Azure CLI credential management for the azurecli Docker volume.
 *
 * Default behaviour (no flags):
 *   1. If ~/.azure exists on the host with valid credentials, inject them
 *      into the Docker volume — fully non-interactive.
 *   2. If no host credentials are found, fall back to interactive
 *      `az login --use-device-code` inside a container.
 *
 * This supports both local dev (where `az login` has already been run)
 * and CI (where credentials come from `az login --service-principal` or
 * federated identity before this script runs).
 *
 * Usage:
 *   node scripts/azure-login.ts              # auto (inject or interactive)
 *   node scripts/azure-login.ts --inject     # inject only (fail if no host creds)
 *   node scripts/azure-login.ts --interactive # force interactive login
 *   node scripts/azure-login.ts --status     # check login status
 *   node scripts/azure-login.ts --set-subscription <id>
 */

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { ensureAzurecliVolume, fixAzurecliPermissions } from './lib/compose-helpers.ts';

const execFileAsync = promisify(execFile);

const VOLUME_NAME = 'azurecli';
const AZ_IMAGE = 'mcr.microsoft.com/azure-cli';
const VOLUME_MOUNT = `${VOLUME_NAME}:/root/.azure`;

// ─── Helpers ────────────────────────────────────────────────────────────

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

function logError(message: string): void {
  process.stderr.write(`ERROR: ${message}\n`);
}

async function dockerVolumeExists(): Promise<boolean> {
  try {
    await execFileAsync('docker', ['volume', 'inspect', VOLUME_NAME]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run an az CLI command in a container with the azurecli volume mounted.
 * Uses spawn for interactive commands (login) and execFile for non-interactive.
 */
async function runAzCommand(
  args: string[],
  interactive: boolean = false
): Promise<{ exitCode: number; stdout: string }> {
  const dockerArgs = ['run', ...(interactive ? ['-it'] : []), '--rm', '-v', VOLUME_MOUNT, AZ_IMAGE, 'az', ...args];

  if (interactive) {
    return new Promise((resolve) => {
      const child = spawn('docker', dockerArgs, {
        stdio: 'inherit'
      });
      child.on('close', (code) => {
        resolve({ exitCode: code ?? 1, stdout: '' });
      });
      child.on('error', (err) => {
        logError(`Failed to run docker: ${err.message}`);
        resolve({ exitCode: 1, stdout: '' });
      });
    });
  }

  try {
    const result = await execFileAsync('docker', dockerArgs, {
      timeout: 30_000,
      maxBuffer: 1024 * 1024
    });
    return { exitCode: 0, stdout: result.stdout };
  } catch (err: unknown) {
    const error = err as { code?: number; stdout?: string; stderr?: string; message?: string };
    if (error.stderr) {
      logError(error.stderr.trim());
    }
    return { exitCode: error.code ?? 1, stdout: error.stdout ?? '' };
  }
}

/**
 * Check whether the azurecli volume has valid credentials.
 * Returns the account info on success.
 */
async function verifyVolumeCredentials(): Promise<{
  ok: boolean;
  message: string;
}> {
  if (!(await dockerVolumeExists())) {
    return { ok: false, message: `Volume '${VOLUME_NAME}' does not exist.` };
  }

  const result = await runAzCommand(['account', 'show', '--output', 'json']);
  if (result.exitCode !== 0 || !result.stdout.trim()) {
    return { ok: false, message: 'Credentials in volume are invalid or expired.' };
  }

  try {
    const account = JSON.parse(result.stdout.trim()) as {
      name: string;
      id: string;
      tenantId: string;
    };
    return {
      ok: true,
      message: `Logged in: ${account.name} (subscription: ${account.id}, tenant: ${account.tenantId})`
    };
  } catch {
    return { ok: false, message: 'Failed to parse account info from volume.' };
  }
}

// ─── Host credential detection ──────────────────────────────────────────

function getHostAzureDir(): string {
  // Respect AZURE_CONFIG_DIR if set (used in CI / non-standard setups)
  if (process.env.AZURE_CONFIG_DIR) {
    return resolve(process.env.AZURE_CONFIG_DIR);
  }
  return join(homedir(), '.azure');
}

/**
 * Check whether the host has Azure CLI credentials that look usable.
 * We check for the presence of key files (msal_token_cache.json or
 * azureProfile.json) — not whether they're expired, since we verify
 * after injection.
 */
function hostHasCredentials(azureDir: string): boolean {
  if (!existsSync(azureDir)) return false;

  try {
    const files = readdirSync(azureDir);
    // Need at least a token cache and a profile to be useful
    const hasTokenCache = files.includes('msal_token_cache.json');
    const hasProfile = files.includes('azureProfile.json');
    return hasTokenCache && hasProfile;
  } catch {
    return false;
  }
}

// ─── Inject credentials from host ───────────────────────────────────────

async function injectFromHost(azureDir: string): Promise<boolean> {
  log(`Injecting credentials from ${azureDir} into Docker volume '${VOLUME_NAME}'...`);

  await ensureAzurecliVolume();

  // Use a temporary container + docker cp to populate the volume.
  // We can't bind-mount host paths directly in Docker-in-Docker (devcontainer).
  const containerName = 'azurecli-inject-tmp';

  try {
    // Clean up any leftover container from a previous failed run
    await execFileAsync('docker', ['rm', '-f', containerName]).catch(() => {});

    // Create a temporary container with the volume mounted
    await execFileAsync('docker', [
      'create',
      '--name',
      containerName,
      '-v',
      `${VOLUME_NAME}:/root/.azure`,
      'busybox',
      'true'
    ]);

    // Copy host credentials into the volume via the container
    await execFileAsync('docker', ['cp', `${azureDir}/.`, `${containerName}:/root/.azure/`]);

    log('  Credentials copied to volume.');

    // Fix ownership so the azcred sidecar (uid 65532) can read mode-600
    // files like config and msal_token_cache.json.
    await fixAzurecliPermissions();

    return true;
  } catch (err: unknown) {
    const error = err as { stderr?: string; message?: string };
    logError(`Failed to inject credentials: ${error.stderr ?? error.message ?? String(err)}`);
    return false;
  } finally {
    // Always clean up the temporary container
    await execFileAsync('docker', ['rm', '-f', containerName]).catch(() => {});
  }
}

// ─── Commands ───────────────────────────────────────────────────────────

/**
 * Default flow: inject from host if possible, otherwise interactive login.
 */
async function autoLogin(): Promise<void> {
  log('');
  log('Azure CLI Credential Setup');
  log('══════════════════════════');
  log('');

  const azureDir = getHostAzureDir();

  if (hostHasCredentials(azureDir)) {
    log(`Found Azure CLI credentials at ${azureDir}`);

    if (!(await injectFromHost(azureDir))) {
      logError('Injection failed. Falling back to interactive login.');
      await interactiveLogin();
      return;
    }

    // Verify the injected credentials actually work
    const check = await verifyVolumeCredentials();
    if (check.ok) {
      log(`  ${check.message}`);
      log('');
      log('Volume is ready. You can now run: docker compose up --build');
      return;
    }

    log(`  Injected credentials are not valid: ${check.message}`);
    log('  Falling back to interactive login.');
    log('');
  } else {
    log(`No Azure CLI credentials found at ${azureDir}`);
    log('Starting interactive login...');
    log('');
  }

  await interactiveLogin();
}

/**
 * Inject-only mode: copy from host, fail if not available.
 */
async function injectOnly(): Promise<void> {
  log('');
  log('Azure CLI Credential Injection');
  log('══════════════════════════════');
  log('');

  const azureDir = getHostAzureDir();

  if (!hostHasCredentials(azureDir)) {
    logError(`No Azure CLI credentials found at ${azureDir}`);
    logError('Run "az login" first, then retry.');
    process.exit(1);
  }

  log(`Found Azure CLI credentials at ${azureDir}`);

  if (!(await injectFromHost(azureDir))) {
    process.exit(1);
  }

  const check = await verifyVolumeCredentials();
  if (!check.ok) {
    logError(`Injected credentials are not valid: ${check.message}`);
    logError('Your Azure CLI session may have expired. Run "az login" and retry.');
    process.exit(1);
  }

  log(`  ${check.message}`);
  log('');
  log('Volume is ready.');
}

/**
 * Interactive device-code login inside a container.
 */
async function interactiveLogin(): Promise<void> {
  log('Interactive Azure CLI Login');
  log('──────────────────────────');
  log('');
  log(`Credentials will be stored in the '${VOLUME_NAME}' Docker volume.`);
  log('');

  await ensureVolume();

  const result = await runAzCommand(['login', '--use-device-code'], true);

  if (result.exitCode === 0) {
    // Fix ownership so the azcred sidecar (uid 65532) can read credentials.
    await fixVolumePermissions();
    log('');
    log('Login successful! The azurecli volume is ready.');
    log('You can now run: docker compose up --build');
  } else {
    logError('Login failed. Please try again.');
    process.exit(1);
  }
}

async function status(): Promise<void> {
  log('Checking Azure CLI login status...');
  log('');

  const check = await verifyVolumeCredentials();

  if (check.ok) {
    log(check.message);
  } else {
    logError(check.message);
    logError('Run this script without arguments to set up credentials.');
    process.exit(1);
  }
}

async function setSubscription(subscriptionId: string): Promise<void> {
  log(`Setting active subscription to: ${subscriptionId}`);

  if (!(await dockerVolumeExists())) {
    logError(`Volume '${VOLUME_NAME}' does not exist. Set up credentials first.`);
    process.exit(1);
  }

  const result = await runAzCommand(['account', 'set', '--subscription', subscriptionId]);

  if (result.exitCode === 0) {
    log('Subscription set successfully.');
    await status();
  } else {
    logError('Failed to set subscription.');
    process.exit(1);
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────

function printUsage(): void {
  log('Usage:');
  log(
    '  azure-login.ts                          Auto: inject from $AZURE_CONFIG_DIR or ~/.azure, or interactive fallback'
  );
  log('  azure-login.ts --inject                 Inject only (fail if no host credentials)');
  log('  azure-login.ts --interactive             Force interactive device-code login');
  log('  azure-login.ts --status                 Check current login status in volume');
  log('  azure-login.ts --set-subscription <id>  Set active subscription');
  log('');
  log('Default behaviour:');
  log('  If ~/.azure (or $AZURE_CONFIG_DIR) has valid credentials');
  log('  (e.g. from a prior "az login"), they are copied into the');
  log('  azurecli Docker volume non-interactively.');
  log('  If no host credentials exist, an interactive device-code login starts.');
  log('');
  log('Environment:');
  log('  AZURE_CONFIG_DIR   Override the Azure CLI config directory');
  log('                     (default: ~/.azure)');
  log('');
  log('CI usage:');
  log('  az login --service-principal ...         # authenticate first');
  log('  node scripts/azure-login.ts --inject');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return;
  }

  if (args.includes('--status')) {
    await status();
    return;
  }

  const subIdx = args.indexOf('--set-subscription');
  if (subIdx !== -1) {
    const subscriptionId = args[subIdx + 1];
    if (!subscriptionId) {
      logError('--set-subscription requires a subscription ID');
      process.exit(1);
    }
    await setSubscription(subscriptionId);
    return;
  }

  if (args.includes('--inject')) {
    await injectOnly();
    return;
  }

  if (args.includes('--interactive')) {
    await ensureVolume();
    await interactiveLogin();
    return;
  }

  // Default: auto (inject if possible, interactive fallback)
  await autoLogin();
}

main().catch((err: unknown) => {
  logError(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
