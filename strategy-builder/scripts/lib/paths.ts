import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, isAbsolute, resolve, sep } from 'node:path';

export const STRATEGY_BUILDER_ROOT = resolve(import.meta.dirname, '..', '..');
export const MONOREPO_ROOT = resolve(STRATEGY_BUILDER_ROOT, '..');
export const STRATEGY_BUILDER_INFRA_ROOT = resolve(STRATEGY_BUILDER_ROOT, 'infra');
export const REFERENCE_ARCHITECTURES_ROOT = resolve(STRATEGY_BUILDER_INFRA_ROOT, 'reference-architectures');
export const INFRA_MODULES_ROOT = resolve(STRATEGY_BUILDER_INFRA_ROOT, 'modules');
export const DEPLOYMENT_STRATEGIES_ROOT = resolve(MONOREPO_ROOT, 'deployment-strategies');

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isStrategyDirectory(path: string): boolean {
  if (!isDirectory(path)) {
    return false;
  }

  return (
    existsSync(resolve(path, 'strategy.provenance.json')) ||
    (existsSync(resolve(path, 'docker-compose.yml')) && isDirectory(resolve(path, 'infra')))
  );
}

export function listGeneratedStrategyDirs(root = DEPLOYMENT_STRATEGIES_ROOT): string[] {
  if (!isDirectory(root)) {
    return [];
  }

  const results: string[] = [];

  function walk(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const fullPath = resolve(dir, entry.name);
      if (isStrategyDirectory(fullPath)) {
        results.push(fullPath);
        continue;
      }

      walk(fullPath);
    }
  }

  walk(root);
  return results.sort((a, b) => a.localeCompare(b));
}

function normalizeStrategyInput(input: string): string {
  const normalized = input
    .replaceAll('\\', '/')
    .trim()
    .replace(/^\.\/+/, '');
  return normalized.startsWith('deployment-strategies/')
    ? normalized.slice('deployment-strategies/'.length)
    : normalized;
}

export function resolveStrategyPath(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return DEPLOYMENT_STRATEGIES_ROOT;
  }

  const normalized = normalizeStrategyInput(trimmed);
  const candidates = isAbsolute(trimmed)
    ? [trimmed]
    : [
        resolve(process.cwd(), trimmed),
        resolve(MONOREPO_ROOT, trimmed),
        resolve(STRATEGY_BUILDER_ROOT, trimmed),
        resolve(DEPLOYMENT_STRATEGIES_ROOT, normalized)
      ];

  for (const candidate of [...new Set(candidates)]) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  if (isAbsolute(trimmed)) {
    return trimmed;
  }

  if (!normalized.includes('/')) {
    const matches = listGeneratedStrategyDirs().filter((dir) => basename(dir) === normalized);
    if (matches.length === 1) {
      const match = matches[0];
      if (match) {
        return match;
      }
    }
    if (matches.length > 1) {
      throw new Error(
        `Strategy name "${trimmed}" is ambiguous. Use deployment-strategies/<reference-architecture>/${trimmed} instead.`
      );
    }
  }

  return normalized.includes('/')
    ? resolve(DEPLOYMENT_STRATEGIES_ROOT, ...normalized.split('/').filter(Boolean))
    : resolve(DEPLOYMENT_STRATEGIES_ROOT, normalized.replaceAll('/', sep));
}
