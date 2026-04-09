/**
 * Shared utility functions and constants for the generator modules.
 *
 * Centralises small helpers that are needed by multiple generator files
 * (copier, index, matrix, reference-architectures) so there is exactly
 * one canonical definition of each.
 */

import { isAbsolute, relative } from 'node:path';

/**
 * Convert Windows-style backslashes to forward slashes for portable paths.
 */
export function toPortablePath(value: string): string {
  return value.replaceAll('\\', '/');
}

/**
 * Check whether `candidatePath` is equal to or a descendant of `rootDir`.
 * Both paths must be absolute.
 */
export function pathIsInside(rootDir: string, candidatePath: string): boolean {
  const rel = relative(rootDir, candidatePath);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Pattern for valid strategy name segments (strategySuffix, variant).
 * Must be lowercase alphanumeric with hyphens, no leading/trailing hyphens.
 */
export const STRATEGY_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Pattern for valid reference architecture IDs.
 * Must be lowercase alphanumeric with hyphens or underscores,
 * no leading/trailing separators.
 */
export const REFERENCE_ARCHITECTURE_ID_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
