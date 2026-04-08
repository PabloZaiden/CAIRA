/**
 * Matrix builder — takes discovered components and produces valid sample
 * configurations (one per agent variant that has a matching API and frontend).
 */

import type { DiscoveredComponent, DiscoveredReferenceArchitecture, SampleConfig } from './types.ts';

/** Information about a skipped combination, useful for diagnostics. */
export interface SkippedCombination {
  readonly agentVariant: string;
  readonly language: string;
  readonly reason: string;
  readonly referenceArchitectureId?: string | undefined;
}

/** Result of building the combination matrix. */
export interface MatrixResult {
  readonly samples: readonly SampleConfig[];
  readonly skipped: readonly SkippedCombination[];
}

/**
 * Build the combination matrix from discovered components.
 *
 * For each agent component, checks that a matching API (same language) and a
 * frontend exist. If so, produces a SampleConfig. If not, records the skip
 * reason. IaC components are attached if they exist but are not required.
 *
 * @param components - All discovered components.
 * @returns Matrix result with valid sample configs and skipped reasons.
 */
export function buildMatrix(
  components: readonly DiscoveredComponent[],
  referenceArchitectures: readonly DiscoveredReferenceArchitecture[]
): MatrixResult {
  const agents = components.filter((c) => c.manifest.type === 'agent');
  const apis = components.filter((c) => c.manifest.type === 'api');
  const frontends = components.filter((c) => c.manifest.type === 'frontend');
  const iacs = components.filter((c) => c.manifest.type === 'iac');

  const samples: SampleConfig[] = [];
  const skipped: SkippedCombination[] = [];

  for (const agent of agents) {
    const { language } = agent.manifest;
    const variant = agent.manifest.variant;

    if (!variant) {
      skipped.push({
        agentVariant: '(no variant)',
        language,
        reason: `Agent at ${agent.relPath} has no "variant" in component.json`
      });
      continue;
    }

    // Find matching API — same language
    const api = apis.find((a) => a.manifest.language === language);
    if (!api) {
      skipped.push({
        agentVariant: variant,
        language,
        reason: `No API component found for language "${language}"`
      });
      continue;
    }

    // Find a frontend — for now we accept any frontend
    // Future: could match on language or explicit compatibility
    const frontend = frontends[0];
    if (!frontend) {
      skipped.push({
        agentVariant: variant,
        language,
        reason: 'No frontend component found'
      });
      continue;
    }

    for (const referenceArchitecture of referenceArchitectures) {
      const compatibleIacs = iacs.filter((iac) => {
        const compatibleReferenceArchitectures = iac.manifest.referenceArchitectures;
        return (
          compatibleReferenceArchitectures === undefined ||
          compatibleReferenceArchitectures.includes(referenceArchitecture.manifest.id)
        );
      });

      if (compatibleIacs.length === 0) {
        skipped.push({
          agentVariant: variant,
          language,
          referenceArchitectureId: referenceArchitecture.manifest.id,
          reason: `No IaC component found for reference architecture "${referenceArchitecture.manifest.id}"`
        });
        continue;
      }

      for (const iac of compatibleIacs) {
        const infraVariant = iac.manifest.strategySuffix ?? iac.manifest.variant;
        if (!infraVariant) {
          skipped.push({
            agentVariant: variant,
            language,
            referenceArchitectureId: referenceArchitecture.manifest.id,
            reason: `IaC component at ${iac.relPath} must declare "variant" or "strategySuffix"`
          });
          continue;
        }

        const name = `${language}-${variant}-${infraVariant}`;
        const relativeDir = `${referenceArchitecture.manifest.id}/${name}`;

        samples.push({
          name,
          relativeDir,
          referenceArchitecture,
          language,
          agentVariant: variant,
          infraVariant,
          agent,
          api,
          frontend,
          iac
        });
      }
    }
  }

  // Sort samples by relative path for deterministic output
  samples.sort((a, b) => a.relativeDir.localeCompare(b.relativeDir));

  return { samples, skipped };
}
