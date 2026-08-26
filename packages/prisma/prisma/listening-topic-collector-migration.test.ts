import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    prismaDir,
    'migrations/20260826190000_add_listening_topic_collection_state/migration.sql',
  ),
  'utf8',
);

describe('listening topic collector persistence (#1795)', () => {
  it('keeps recoverable collection state on each topic source', () => {
    expect(schema).toContain(
      'collectionState     String    @default("pending")',
    );
    expect(schema).toContain('collectionCursor    String?');
    expect(schema).toContain('lastCollectedAt     DateTime?');
    expect(schema).toContain('lastCollectionError String?');
    expect(schema).toContain('rateLimitedAt       DateTime?');
    expect(migration).toContain(
      'listening_topic_sources_collection_state_check',
    );
    expect(migration).toContain(
      "CHECK (\"collectionState\" IN ('pending', 'success', 'empty', 'failed', 'rate_limited'))",
    );
  });

  it('does not replace the canonical evidence dedupe identity', () => {
    expect(schema).toContain(
      '@@unique([topicId, platform, externalId], map: "listening_evidence_topic_platform_external_key")',
    );
    expect(migration).not.toContain('DROP INDEX');
    expect(migration).not.toContain('listening_evidence');
  });
});
