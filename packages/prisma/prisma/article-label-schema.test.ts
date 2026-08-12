import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schemaSource = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');

/**
 * Sentry API-GENFEED-AI-71 / 72: production threw
 *   Invalid `prisma.article.findFirst()` … column `articles.title` does not exist
 * after the #2767 rename to label/summary landed in the DB while an older
 * Prisma client still selected `title`. Tip schema must stay on label/summary.
 *
 * #2420 originally tracked missing mongoId columns; tip no longer declares
 * mongoId on EditorProject / Trend (dropped in 20260805043000).
 */
describe('article + mongoId schema parity (Sentry 71/72, #2420)', () => {
  it('maps Article persistence to label/summary, not title/excerpt', () => {
    const articleBlock = schemaSource.match(
      /model Article \{[\s\S]*?\n\}/,
    )?.[0];
    expect(articleBlock).toBeDefined();
    expect(articleBlock).toContain('label');
    expect(articleBlock).toContain('summary');
    expect(articleBlock).not.toMatch(/^\s*title\s+/m);
    expect(articleBlock).not.toMatch(/^\s*excerpt\s+/m);
  });

  it('does not persist generate metadata as Article columns (#2859)', () => {
    const articleBlock = schemaSource.match(
      /model Article \{[\s\S]*?\n\}/,
    )?.[0];
    expect(articleBlock).toBeDefined();
    expect(articleBlock).toContain('label');
    expect(articleBlock).toContain('summary');
    expect(articleBlock).toContain('content');
    expect(articleBlock).not.toMatch(/^\s*aiGeneration\s+/m);
    expect(articleBlock).not.toMatch(/^\s*xArticleMetadata\s+/m);
  });

  it('does not reintroduce mongoId on EditorProject or Trend', () => {
    const editor = schemaSource.match(
      /model EditorProject \{[\s\S]*?\n\}/,
    )?.[0];
    const trend = schemaSource.match(/model Trend \{[\s\S]*?\n\}/)?.[0];
    expect(editor).toBeDefined();
    expect(trend).toBeDefined();
    expect(editor).not.toContain('mongoId');
    expect(trend).not.toContain('mongoId');
  });

  it('keeps the remove_mongo_identity migration in the tree (#2420)', () => {
    const migration = readFileSync(
      join(
        prismaDir,
        'migrations/20260805043000_remove_mongo_identity_columns/migration.sql',
      ),
      'utf8',
    );
    expect(migration.length).toBeGreaterThan(0);
  });
});
