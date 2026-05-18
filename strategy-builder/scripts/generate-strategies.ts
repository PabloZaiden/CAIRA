/**
 * generate-strategies.ts — CLI entry point for deployment strategy generation.
 *
 * Discovers components and reference architectures, builds the combination
 * matrix, and generates self-contained deployment strategies grouped under
 * deployment-strategies/<reference-architecture>/.
 *
 * Usage:
 *   node scripts/generate-strategies.ts
 *   node scripts/generate-strategies.ts --clean
 *   node scripts/generate-strategies.ts --dry-run
 */

import { resolve } from 'node:path';
import { generate, discoverComponents, buildMatrix } from './lib/generator/index.ts';
import { discoverReferenceArchitectures } from './lib/generator/reference-architectures.ts';

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

Discovers components and reference architectures, builds the combination matrix,
and generates self-contained deployment strategies under deployment-strategies/<reference-architecture>/.
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
  const referenceArchitectures = await discoverReferenceArchitectures(
    resolve(repoRoot, 'infra', 'reference-architectures'),
    repoRoot
  );
  console.log(`  Discovered ${components.length} components:`);
  for (const c of components) {
    console.log(`    - ${c.manifest.type}/${c.manifest.variant ?? c.manifest.language} (${c.relPath})`);
  }
  console.log();

  console.log(`  Discovered ${referenceArchitectures.length} reference architecture(s):`);
  for (const architecture of referenceArchitectures) {
    console.log(`    - ${architecture.manifest.id} (${architecture.relPath})`);
  }
  console.log();

  const matrix = buildMatrix(components, referenceArchitectures);
  if (matrix.skipped.length > 0) {
    console.log('  Skipped combinations:');
    for (const skip of matrix.skipped) {
      const context = skip.referenceArchitectureId ? `${skip.referenceArchitectureId}: ` : '';
      console.log(`    - ${context}${skip.language}/${skip.agentVariant}: ${skip.reason}`);
    }
    console.log();
  }

  console.log(`  Would generate ${matrix.samples.length} deployment strategy(ies):`);
  for (const sample of matrix.samples) {
    console.log(`    - ${sample.relativeDir}`);
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
