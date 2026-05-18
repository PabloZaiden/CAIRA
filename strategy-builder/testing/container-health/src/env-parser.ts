/**
 * Parse a .env file into key-value entries.
 *
 * Supports:
 * - KEY=VALUE
 * - KEY="VALUE" (double-quoted, strips quotes)
 * - KEY='VALUE' (single-quoted, strips quotes)
 * - # comments (full-line and inline after unquoted values)
 * - Empty lines (skipped)
 * - Lines with only whitespace (skipped)
 * - export KEY=VALUE (strips leading "export ")
 */

import { readFile } from 'node:fs/promises';

import type { EnvFileEntry } from './types.ts';

/** Parse env file content string into entries */
export function parseEnvContent(content: string): EnvFileEntry[] {
  const entries: EnvFileEntry[] = [];

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();

    // Skip empty lines and comments
    if (line === '' || line.startsWith('#')) continue;

    // Strip optional "export " prefix
    const stripped = line.startsWith('export ') ? line.slice(7) : line;

    // Find the first = sign
    const eqIndex = stripped.indexOf('=');
    if (eqIndex === -1) continue; // not a valid entry

    const key = stripped.slice(0, eqIndex).trim();
    if (key === '') continue; // empty key

    let value = stripped.slice(eqIndex + 1).trim();

    // Handle quoted values
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      // Strip inline comments for unquoted values
      const commentIndex = value.indexOf(' #');
      if (commentIndex !== -1) {
        value = value.slice(0, commentIndex).trim();
      }
    }

    entries.push({ key, value });
  }

  return entries;
}

/** Read and parse a .env file from disk */
export async function parseEnvFile(filePath: string): Promise<EnvFileEntry[]> {
  const content = await readFile(filePath, 'utf-8');
  return parseEnvContent(content);
}
