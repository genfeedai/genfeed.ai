/**
 * JSONL fixture loader: one row per line, `//` comment lines skipped, every
 * row validated against `fixtureRowSchema` before any provider call.
 */

import { readFileSync } from 'node:fs';
import type { FixtureRow, LoadedFixture } from './contracts';
import { fixtureRowSchema } from './contracts';
import { sha256Digest } from './provenance';

export function parseFixture(contents: string, path: string): FixtureRow[] {
  const rows = contents
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('//'))
    .map((line, index) => {
      const parsed = fixtureRowSchema.safeParse(JSON.parse(line));
      if (!parsed.success) {
        throw new Error(
          `${path} row ${index + 1}: ${parsed.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; ')}`,
        );
      }

      return parsed.data;
    });

  if (rows.length === 0) {
    throw new Error(`Fixture ${path} has no rows`);
  }

  const ids = new Set<string>();
  for (const row of rows) {
    if (ids.has(row.id)) {
      throw new Error(`Fixture ${path} repeats row id "${row.id}"`);
    }
    ids.add(row.id);
  }

  return rows;
}

export function loadFixture(path: string): LoadedFixture {
  const contents = readFileSync(path, 'utf8');

  return {
    digest: sha256Digest(contents),
    path,
    rows: parseFixture(contents, path),
  };
}
