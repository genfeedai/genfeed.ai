import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    prismaDir,
    'migrations/20260812210000_add_pattern_extraction_checkpoint/migration.sql',
  ),
  'utf8',
);

describe('pattern_extraction_checkpoints (#2513)', () => {
  it('declares a unique source cursor without touching AdPerformance', () => {
    const executableSql = migration.replace(/^\s*--.*$/gmu, '');

    expect(schema).toContain('model PatternExtractionCheckpoint');
    expect(schema).toContain('@@map("pattern_extraction_checkpoints")');
    expect(schema).toContain('source     String   @unique');
    expect(migration).toContain('pattern_extraction_checkpoints');
    expect(migration).toContain('pattern_extraction_checkpoints_source_key');
    expect(executableSql).not.toContain('"ad_performance"');
  });
});
