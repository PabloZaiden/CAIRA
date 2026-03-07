import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { log, logError, waitForHealthy } from './lib/compose-helpers.ts';
import { resolveStrategyPath } from './lib/paths.ts';

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(import.meta.dirname ?? '.', '..');
const DEPLOY_SCRIPT = resolve(REPO_ROOT, 'scripts', 'deploy-strategy-azure.ts');
const E2E_DIR = resolve(REPO_ROOT, 'testing', 'e2e');

interface CliOptions {
  strategy: string | undefined;
  keepDeployed: boolean;
  location: string | undefined;
  allowedCidr: string | undefined;
  projectName: string | undefined;
  tag: string | undefined;
}

function printUsage(): void {
  process.stdout.write(
    `
Test a deployed strategy on Azure Container Apps

Usage:
  task strategy:test:deployed -- <path>

Options:
  --strategy <path>       Path or name of the deployment strategy directory (required)
  --keep-deployed         Skip destroy after validation
  --location <region>     Azure region override
  --allowed-cidr <cidr>   Ingress allowlist CIDR override
  --name <project-name>   Resource naming prefix override
  --tag <tag>             Image tag override
  --help, -h              Show help

Advanced direct script usage:
  node scripts/test-deployed-strategy.ts --strategy deployment-strategies/typescript-openai-agent-sdk
`.trimStart()
  );
}

function parseArgs(args: string[]): CliOptions | null {
  const options: CliOptions = {
    strategy: undefined,
    keepDeployed: false,
    location: undefined,
    allowedCidr: undefined,
    projectName: undefined,
    tag: undefined
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    switch (arg) {
      case '--strategy':
        options.strategy = args[++i];
        break;
      case '--keep-deployed':
        options.keepDeployed = true;
        break;
      case '--location':
        options.location = args[++i];
        break;
      case '--allowed-cidr':
        options.allowedCidr = args[++i];
        break;
      case '--name':
        options.projectName = args[++i];
        break;
      case '--tag':
        options.tag = args[++i];
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        logError(`Unknown option: ${arg}`);
        printUsage();
        return null;
    }
  }

  if (!options.strategy) {
    logError('--strategy <path> is required');
    printUsage();
    return null;
  }

  return options;
}

async function runStreaming(command: string, args: string[], cwd: string, env?: Record<string, string>): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: 'inherit'
    });

    child.on('error', rejectPromise);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(
        new Error(`${command} ${args.join(' ')} failed with ${signal ? `signal ${signal}` : `exit code ${code ?? 1}`}`)
      );
    });
  });
}

async function ensureE2EDependencies(): Promise<void> {
  if (!existsSync(resolve(E2E_DIR, 'node_modules'))) {
    log('Installing E2E test dependencies...');
    await runStreaming('npm', ['install'], E2E_DIR);
  }
}

async function readFrontendUrl(infraDir: string): Promise<string> {
  const result = await execFileAsync('terraform', ['output', '-raw', 'frontend_url'], {
    cwd: infraDir,
    timeout: 30_000,
    maxBuffer: 1024 * 1024
  });
  return result.stdout.trim();
}

async function destroyStrategy(strategy: string): Promise<void> {
  log('Destroying deployment strategy...');
  await runStreaming(process.execPath, [DEPLOY_SCRIPT, '--destroy', '--strategy', strategy], REPO_ROOT);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!options || !options.strategy) {
    process.exit(1);
  }

  const strategyDir = resolveStrategyPath(options.strategy);
  const infraDir = resolve(strategyDir, 'infra');
  const deployArgs = [DEPLOY_SCRIPT, '--strategy', options.strategy];

  if (options.location) deployArgs.push('--location', options.location);
  if (options.allowedCidr) deployArgs.push('--allowed-cidr', options.allowedCidr);
  if (options.projectName) deployArgs.push('--name', options.projectName);
  if (options.tag) deployArgs.push('--tag', options.tag);

  try {
    log('Deploying strategy to Azure Container Apps...');
    await runStreaming(process.execPath, deployArgs, REPO_ROOT);

    const frontendUrl = await readFrontendUrl(infraDir);
    if (!frontendUrl) {
      throw new Error('Could not read frontend_url Terraform output after deploy');
    }

    const healthUrl = `${frontendUrl.replace(/\/+$/, '')}/health`;
    log(`Waiting for deployed frontend health endpoint: ${healthUrl}`);
    const healthy = await waitForHealthy(healthUrl, 180_000);
    if (!healthy) {
      throw new Error(`Deployed frontend did not become healthy at ${healthUrl}`);
    }

    await ensureE2EDependencies();

    log(`Running deployed E2E tests against ${frontendUrl}`);
    await runStreaming('npx', ['vitest', 'run', '--reporter', 'verbose'], E2E_DIR, {
      E2E_BASE_URL: frontendUrl
    });

    log('Deployed strategy validation passed.');
  } finally {
    if (!options.keepDeployed) {
      try {
        await destroyStrategy(options.strategy);
      } catch (error) {
        logError(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    } else {
      log(`Keeping deployment for ${options.strategy}`);
    }
  }
}

main().catch((error: unknown) => {
  logError(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
