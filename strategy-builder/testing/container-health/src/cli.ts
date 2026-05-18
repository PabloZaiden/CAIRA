/**
 * Container Health Validator — CLI entry point
 *
 * Usage:
 *   node src/cli.ts --dockerfile <path> --health /health [options]
 *
 * Options:
 *   --dockerfile <path>   Path to Dockerfile (required)
 *   --health <endpoint>   Health endpoint path, e.g. /health (required)
 *   --port <number>       Host port to bind (default: random)
 *   --container-port <n>  Container port to expose (default: 3000)
 *   --env-file <path>     Path to .env file for container
 *   --timeout <ms>        Health check timeout in ms (default: 60000)
 *   --context <path>      Docker build context directory (default: Dockerfile dir)
 *   --tag <tag>           Docker image tag (default: auto-generated)
 *   --keep-alive          Don't remove the container after validation
 *   --help                Show this help message
 */

import { validateContainer } from './validate-container.ts';

function printUsage(): void {
  const usage = `
Container Health Validator

Builds a Docker image, starts a container, and validates the health endpoint.

Usage:
  node src/cli.ts --dockerfile <path> --health <endpoint> [options]

Required:
  --dockerfile <path>     Path to Dockerfile
  --health <endpoint>     Health endpoint path (e.g., /health)

Options:
  --port <number>         Host port to bind (default: random available port)
  --container-port <n>    Container port to expose (default: 3000)
  --env-file <path>       Path to .env file for container environment variables
  --timeout <ms>          Health check timeout in milliseconds (default: 60000)
  --context <path>        Docker build context directory (default: Dockerfile directory)
  --tag <tag>             Docker image tag (default: auto-generated)
  --keep-alive            Don't remove the container after validation
  --help                  Show this help message

Examples:
  # Validate a Dockerfile with default settings
  node src/cli.ts --dockerfile ./Dockerfile --health /health

  # Validate with specific port and env file
  node src/cli.ts \\
    --dockerfile components/agent/typescript/foundry-agent-service/Dockerfile \\
    --health /health --port 3000 --env-file .env.test

  # Validate with custom timeout
  node src/cli.ts --dockerfile ./Dockerfile --health /health --timeout 120000
`.trim();

  console.log(usage);
}

function parseArgs(argv: string[]): {
  dockerfile?: string | undefined;
  health?: string | undefined;
  port?: number | undefined;
  containerPort?: number | undefined;
  envFile?: string | undefined;
  timeout?: number | undefined;
  context?: string | undefined;
  tag?: string | undefined;
  keepAlive: boolean;
  help: boolean;
} {
  const result: ReturnType<typeof parseArgs> = {
    keepAlive: false,
    help: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--dockerfile':
        result.dockerfile = argv[++i];
        break;
      case '--health':
        result.health = argv[++i];
        break;
      case '--port':
        result.port = parseInt(argv[++i] ?? '', 10);
        break;
      case '--container-port':
        result.containerPort = parseInt(argv[++i] ?? '', 10);
        break;
      case '--env-file':
        result.envFile = argv[++i];
        break;
      case '--timeout':
        result.timeout = parseInt(argv[++i] ?? '', 10);
        break;
      case '--context':
        result.context = argv[++i];
        break;
      case '--tag':
        result.tag = argv[++i];
        break;
      case '--keep-alive':
        result.keepAlive = true;
        break;
      case '--help':
        result.help = true;
        break;
    }
  }

  return result;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  if (!args.dockerfile) {
    console.error('Error: --dockerfile is required');
    console.error('Run with --help for usage information');
    process.exit(1);
  }

  if (!args.health) {
    console.error('Error: --health is required');
    console.error('Run with --help for usage information');
    process.exit(1);
  }

  console.log('Container Health Validator');
  console.log('='.repeat(50));
  console.log(`  Dockerfile:      ${args.dockerfile}`);
  console.log(`  Health endpoint: ${args.health}`);
  if (args.port !== undefined) console.log(`  Host port:       ${args.port}`);
  if (args.containerPort !== undefined) console.log(`  Container port:  ${args.containerPort}`);
  if (args.envFile) console.log(`  Env file:        ${args.envFile}`);
  if (args.timeout !== undefined) console.log(`  Timeout:         ${args.timeout}ms`);
  if (args.context) console.log(`  Build context:   ${args.context}`);
  if (args.tag) console.log(`  Image tag:       ${args.tag}`);
  if (args.keepAlive) console.log(`  Keep alive:      yes`);
  console.log('='.repeat(50));
  console.log();

  console.log('Building Docker image...');

  const result = await validateContainer({
    dockerfile: args.dockerfile,
    healthEndpoint: args.health,
    port: args.port,
    containerPort: args.containerPort,
    envFile: args.envFile,
    timeout: args.timeout,
    context: args.context,
    imageTag: args.tag,
    keepAlive: args.keepAlive
  });

  console.log();
  console.log('Results');
  console.log('-'.repeat(50));
  console.log(`  Status:          ${result.passed ? 'PASS' : 'FAIL'}`);
  console.log(`  Image tag:       ${result.imageTag}`);
  if (result.containerId) console.log(`  Container ID:    ${result.containerId.slice(0, 12)}`);
  if (result.hostPort) console.log(`  Host port:       ${result.hostPort}`);
  console.log(`  Build time:      ${result.buildDurationMs}ms`);
  console.log(`  Health check:    ${result.healthCheckDurationMs}ms`);
  console.log(`  Total time:      ${result.totalDurationMs}ms`);
  if (result.healthStatus !== undefined) console.log(`  Health status:   ${result.healthStatus}`);
  if (result.error) console.log(`  Error:           ${result.error}`);
  console.log(
    `  Cleanup:         container=${result.cleanup.containerRemoved ? 'removed' : 'kept'}, image=${result.cleanup.imageRemoved ? 'removed' : 'kept'}`
  );
  console.log('-'.repeat(50));

  if (result.passed) {
    console.log('\nHealth check PASSED');
  } else {
    console.error('\nHealth check FAILED');
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
