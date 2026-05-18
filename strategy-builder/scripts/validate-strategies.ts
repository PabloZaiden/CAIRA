/**
 * validate-strategies.ts — CLI entry point for deployment strategy drift validation.
 *
 * Re-generates deployment strategies in a temp directory and diffs against
 * deployment-strategies/ to detect hand-edits or stale output.
 *
 * Usage:
 *   node scripts/validate-strategies.ts
 *
 * Exit codes:
 *   0 — deployment-strategies/ matches generated output exactly
 *   1 — drift detected (hand-edits or stale output)
 */

import { resolve } from 'node:path';
import { validateSamples } from './lib/generator/validator.ts';

const repoRoot = resolve(import.meta.dirname, '..');

console.log('╔══════════════════════════════════════════╗');
console.log('║ CAIRA Deployment Strategy Drift Validator║');
console.log('╚══════════════════════════════════════════╝');
console.log();

try {
  console.log('  Regenerating deployment strategies in temp directory and comparing...');
  console.log();

  const result = await validateSamples(repoRoot);

  if (result.ok) {
    console.log('  ✓ No drift detected — deployment-strategies/ matches generated output.');
    console.log();
    process.exit(0);
  }

  console.log(`  ✗ Drift detected — ${result.diffs.length} difference(s) found:`);
  console.log();

  for (const diff of result.diffs) {
    switch (diff.kind) {
      case 'content-mismatch':
        console.log(`    MODIFIED  ${diff.file}`);
        break;
      case 'missing':
        console.log(`    MISSING   ${diff.file}`);
        break;
      case 'extra':
        console.log(`    EXTRA     ${diff.file}`);
        break;
    }
  }

  console.log();
  console.log('  To fix: run `node scripts/generate-strategies.ts`');
  console.log('  Never hand-edit files in deployment-strategies/ — change components or the generator instead.');
  console.log();
  process.exit(1);
} catch (err) {
  console.error(`\n  ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
