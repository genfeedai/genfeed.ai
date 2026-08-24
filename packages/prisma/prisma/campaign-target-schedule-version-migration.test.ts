import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schemaSource = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20260824120000_add_campaign_target_schedule_version/migration.sql',
  ),
  'utf8',
);

describe('campaign target schedule version (#3408)', () => {
  it('adds a durable scheduleVersion column for due-time claims', () => {
    expect(schemaSource).toContain(
      'scheduleVersion Int              @default(1)',
    );
    expect(migrationSource).toContain(
      'ADD COLUMN "scheduleVersion" INTEGER NOT NULL DEFAULT 1',
    );
  });
});
