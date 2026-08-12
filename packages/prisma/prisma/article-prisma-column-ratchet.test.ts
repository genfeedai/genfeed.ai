import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Sentry API-GENFEED-AI-71 / 72: production Prisma client still selected
 * `articles.title` after the column was renamed to `label` (#2767).
 *
 * This ratchet fails if server/serializer sources put a Prisma write/filter
 * key named `title` or `excerpt` on `article` / `articles` persistence paths.
 * Domain/UI "title" in copy, DTO descriptions, or mapping *from* `label` is fine.
 */
const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const monorepoRoot = join(prismaDir, '../../..');

const SCAN_ROOTS = [
  'apps/server/api/src/collections/articles',
  'packages/serializers/src/attributes/content',
  'packages/serializers/src/server/content',
] as const;

const FORBIDDEN = [
  // Prisma create/update data keys for the renamed columns
  /prisma\.article\.(create|update|upsert|createMany)[\s\S]{0,400}?\b(title|excerpt)\s*:/i,
  /delegate\.(create|update|upsert)[\s\S]{0,400}?\b(title|excerpt)\s*:/i,
  // Raw SQL against dropped columns
  /articles\.(title|excerpt)\b/i,
  /"articles"\s*\.\s*"(title|excerpt)"/i,
];

function walkTsFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walkTsFiles(full, out);
    } else if (
      (name.endsWith('.ts') || name.endsWith('.tsx')) &&
      !name.includes('.spec.') &&
      !name.includes('.test.')
    ) {
      out.push(full);
    }
  }
  return out;
}

describe('article Prisma column ratchet (Sentry 71/72)', () => {
  it('does not persist or query articles.title / articles.excerpt', () => {
    const offenders: string[] = [];

    for (const root of SCAN_ROOTS) {
      const abs = join(monorepoRoot, root);
      for (const file of walkTsFiles(abs)) {
        const source = readFileSync(file, 'utf8');
        for (const pattern of FORBIDDEN) {
          if (pattern.test(source)) {
            offenders.push(
              `${file.replace(monorepoRoot + '/', '')} ~ ${pattern}`,
            );
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
