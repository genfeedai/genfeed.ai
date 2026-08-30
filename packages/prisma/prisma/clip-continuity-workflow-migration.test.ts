import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    prismaDir,
    'migrations/20260828180000_workflow_native_clip_continuity/migration.sql',
  ),
  'utf8',
);

describe('workflow-native clip continuity migration', () => {
  it('persists the durable queue state and exact workflow provenance', () => {
    expect(schema).toContain(
      'continuityQaStatus            String             @default("not-required")',
    );
    expect(schema).toContain(
      'continuityWorkflowExecutionId String?            @unique',
    );
    expect(migration).toContain('"continuityQaStatus" TEXT NOT NULL');
    expect(migration).toContain('"continuityWorkflowExecutionId" TEXT');
    expect(migration).toContain(
      'clip_projects_continuityWorkflowExecutionId_fkey',
    );
  });

  it('uses separate named relations for generation and continuity runs', () => {
    expect(schema).toContain('"clip_generation_workflow_execution"');
    expect(schema).toContain('"clip_continuity_workflow_execution"');
  });
});
