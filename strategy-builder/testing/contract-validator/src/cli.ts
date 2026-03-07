/**
 * CLI entry point for the contract compliance validator.
 *
 * Usage:
 *   node src/cli.ts --spec <path> --url <url>
 *   npx tsx src/cli.ts --spec <path> --url <url>
 *   npm run validate -- --spec <path> --url <url>
 *
 * Options:
 *   --spec <path>     Path to the OpenAPI 3.1.0 spec file (YAML or JSON)
 *   --url <url>       Base URL of the running service
 *   --token <token>   Bearer token for Authorization header (optional)
 *   --timeout <ms>    Request timeout in milliseconds (default: 5000)
 *   --no-sse          Skip SSE endpoint validation
 *   --skip-paths <p>  Comma-separated path templates to skip
 *   --help            Show this help message
 */

import { parseArgs } from 'node:util';
import { validateContract } from './validator.ts';
import type { ContractResult, ValidateOptions } from './types.ts';

function printHelp(): void {
  const help = `
Contract Compliance Validator

Validates a running HTTP service against its OpenAPI 3.1.0 spec.

USAGE:
  node src/cli.ts --spec <path> --url <url> [options]

OPTIONS:
  --spec <path>     Path to the OpenAPI 3.1.0 spec file (YAML or JSON)  [required]
  --url <url>       Base URL of the running service                     [required]
  --token <token>   Bearer token for Authorization header               [optional]
  --timeout <ms>    Request timeout in milliseconds (default: 5000)     [optional]
  --no-sse          Skip SSE endpoint validation                        [optional]
  --skip-paths <p>  Comma-separated path templates to skip              [optional]
  --help            Show this help message

EXAMPLES:
  # Validate agent container against its spec
  npm run validate -- --spec ../../contracts/agent-api.openapi.yaml --url http://localhost:3000

  # Validate with auth token and custom timeout
  npm run validate -- --spec ../../contracts/agent-api.openapi.yaml --url http://localhost:3000 --token eyJ... --timeout 10000

  # Skip SSE validation
  npm run validate -- --spec ../../contracts/agent-api.openapi.yaml --url http://localhost:3000 --no-sse

  # Skip specific path templates
  npm run validate -- --spec ../../contracts/agent-api.openapi.yaml --url http://localhost:3000 --skip-paths '/conversations/{conversationId},/conversations/{conversationId}/messages'
`.trim();

  console.log(help);
}

function printResults(results: ContractResult[]): void {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log('');
  console.log('='.repeat(80));
  console.log('Contract Compliance Results');
  console.log('='.repeat(80));
  console.log('');

  // Column widths
  const methodWidth = 7;
  const pathWidth = 45;
  const statusWidth = 12;
  const timeWidth = 8;
  const resultWidth = 6;

  // Header
  const header = [
    'Method'.padEnd(methodWidth),
    'Path'.padEnd(pathWidth),
    'Status'.padEnd(statusWidth),
    'Time'.padEnd(timeWidth),
    'Result'.padEnd(resultWidth)
  ].join(' ');
  console.log(header);
  console.log('-'.repeat(80));

  // Results
  for (const r of results) {
    const method = r.method.padEnd(methodWidth);
    const path = r.path.length > pathWidth ? r.path.slice(0, pathWidth - 3) + '...' : r.path.padEnd(pathWidth);
    const status =
      r.actualStatus === 0
        ? 'CONN ERR'.padEnd(statusWidth)
        : `${String(r.actualStatus)}/${String(r.expectedStatus)}`.padEnd(statusWidth);
    const time = `${String(r.durationMs)}ms`.padEnd(timeWidth);
    const result = r.passed ? 'PASS' : 'FAIL';

    console.log(`${method} ${path} ${status} ${time} ${result}`);

    // Print errors indented
    if (r.errors.length > 0) {
      for (const err of r.errors) {
        console.log(`         ${err}`);
      }
    }
  }

  console.log('-'.repeat(80));
  console.log(`Total: ${String(total)} | Passed: ${String(passed)} | Failed: ${String(failed)}`);
  console.log('='.repeat(80));
}

async function main(): Promise<void> {
  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs({
      options: {
        spec: { type: 'string' },
        url: { type: 'string' },
        token: { type: 'string' },
        timeout: { type: 'string' },
        'no-sse': { type: 'boolean', default: false },
        'skip-paths': { type: 'string' },
        help: { type: 'boolean', default: false }
      },
      strict: true
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`Error: ${message}`);
    console.error('Run with --help for usage information.');
    process.exit(2);
  }

  if (args.values.help) {
    printHelp();
    process.exit(0);
  }

  const specPath = args.values.spec as string | undefined;
  const baseUrl = args.values.url as string | undefined;

  if (!specPath) {
    console.error('Error: --spec is required');
    console.error('Run with --help for usage information.');
    process.exit(2);
  }

  if (!baseUrl) {
    console.error('Error: --url is required');
    console.error('Run with --help for usage information.');
    process.exit(2);
  }

  const options: ValidateOptions = {};

  if (args.values.token) {
    options.bearerToken = args.values.token as string;
  }

  if (args.values.timeout) {
    const parsed = parseInt(args.values.timeout as string, 10);
    if (isNaN(parsed) || parsed <= 0) {
      console.error('Error: --timeout must be a positive integer');
      process.exit(2);
    }
    options.requestTimeout = parsed;
  }

  if (args.values['no-sse']) {
    options.validateSSE = false;
  }

  if (args.values['skip-paths']) {
    options.skipPaths = (args.values['skip-paths'] as string)
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
  }

  console.log(`Validating ${baseUrl} against ${specPath}...`);
  console.log('');

  try {
    const results = await validateContract(specPath, baseUrl, options);

    printResults(results);

    const hasFailed = results.some((r) => !r.passed);
    process.exit(hasFailed ? 1 : 0);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`Fatal error: ${message}`);
    process.exit(2);
  }
}

void main();
