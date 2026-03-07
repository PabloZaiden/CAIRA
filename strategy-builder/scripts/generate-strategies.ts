/**
 * generate-strategies.ts — CLI entry point for deployment strategy generation.
 *
 * Discovers components, builds the combination matrix, and generates
 * self-contained deployment strategies under deployment-strategies/.
 *
 * Usage:
 *   node scripts/generate-strategies.ts
 *   node scripts/generate-strategies.ts --clean
 *   node scripts/generate-strategies.ts --dry-run
 */

import { resolve } from 'node:path';
import { generate, discoverComponents, buildMatrix } from './lib/generator/index.ts';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const noClean = args.includes('--no-clean');
const help = args.includes('--help') || args.includes('-h');

if (help) {
  console.log(
    `
Usage: node scripts/generate-strategies.ts [options]

Options:
  --dry-run    Show what would be generated without writing files
  --no-clean   Don't remove existing deployment-strategies/ before generating
  --help, -h   Show this help message

Discovers components from components/, builds the combination matrix,
and generates self-contained deployment strategies under deployment-strategies/.
`.trim()
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const repoRoot = resolve(import.meta.dirname, '..');
const samplesDir = resolve(repoRoot, '..', 'deployment-strategies');

console.log('╔══════════════════════════════════════════╗');
console.log('║  CAIRA Deployment Strategy Generator     ║');
console.log('╚══════════════════════════════════════════╝');
console.log();

if (dryRun) {
  console.log('  Mode: DRY RUN (no files will be written)');
  console.log();
  // For dry run, we just run discovery + matrix to show what would happen
  const components = await discoverComponents(resolve(repoRoot, 'components'), repoRoot);
  console.log(`  Discovered ${components.length} components:`);
  for (const c of components) {
    console.log(`    - ${c.manifest.type}/${c.manifest.variant ?? c.manifest.language} (${c.relPath})`);
  }
  console.log();

  const matrix = buildMatrix(components);
  if (matrix.skipped.length > 0) {
    console.log('  Skipped combinations:');
    for (const skip of matrix.skipped) {
      console.log(`    - ${skip.language}/${skip.agentVariant}: ${skip.reason}`);
    }
    console.log();
  }

  console.log(`  Would generate ${matrix.samples.length} deployment strategy(ies):`);
  for (const sample of matrix.samples) {
    console.log(`    - ${sample.name}`);
  }
  console.log();
  process.exit(0);
}

try {
  const result = await generate({
    repoRoot,
    samplesDir,
    clean: !noClean
  });

  console.log(`  Generated ${result.details.length} deployment strategy(ies):`);
  console.log();

  for (const detail of result.details) {
    console.log(`  📦 ${detail.name}`);
    console.log(`     Component files: ${detail.componentFilesCopied}`);
    console.log(`     Generated files: ${detail.generatedFilesWritten}`);
    console.log(`     Extra files:     ${detail.extraFilesCopied}`);
    console.log();
  }

  console.log(`  Total deployment strategies: ${result.details.length}`);
  console.log();
  console.log('  Done.');
} catch (err) {
  console.error(`\n  ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
