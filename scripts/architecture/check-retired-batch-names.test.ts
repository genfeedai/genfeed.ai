import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkRetiredBatchNames,
  findRetiredBatchNames,
} from './check-retired-batch-names';

const testDirs: string[] = [];

afterEach(() => {
  for (const testDir of testDirs.splice(0)) {
    rmSync(testDir, { force: true, recursive: true });
  }
});

function fixture(files: Record<string, string>): string {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'retired-batch-names-'));
  testDirs.push(rootDir);
  for (const [file, source] of Object.entries(files)) {
    const absolutePath = path.join(rootDir, file);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, source);
  }
  return rootDir;
}

describe('retired Batch product name guard (#5936)', () => {
  it('accepts Turbo names and generic batching', () => {
    expect(
      findRetiredBatchNames(
        'apps/server/api/src/example.ts',
        [
          "import { TurboRunService } from '@api/services/turbo-run/turbo-run.service';",
          'const batchSize = 50;',
          "const execution = 'workflow.batch.execute';",
          'await prisma.post.updateMany({ where: { id: { in: ids } } }); // in batches',
          'type LearningBatchGenerationInput = { count: number };',
          "import { X } from '@api/collections/workflows/services/batch-workflow-execution.service';",
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('rejects Batch product identifiers, routes, tools and keys', () => {
    const names = findRetiredBatchNames(
      'apps/app/example.ts',
      [
        'import { BatchProjectStatus } from "@genfeedai/contracts";',
        "const href = '/studio/batch/new';",
        "const tool = 'generate_content_batch';",
        'const id = post.reviewBatchId;',
        'await prisma.batch.findMany();',
        "readSource('src/features/workflows/pages/batch/Page.tsx');",
      ].join('\n'),
    ).map((violation) => violation.name);

    expect(names).toEqual([
      'BatchProjectStatus',
      '/studio/batch',
      'generate_content_batch',
      'reviewBatchId',
      'prisma.batch',
      'pages/batch',
    ]);
  });

  it('skips history and generic batching paths', () => {
    const rootDir = fixture({
      'packages/prisma/prisma/migrations/1_init/migration.sql':
        'CREATE TABLE "batch_items" ("batchId" TEXT);',
      'apps/server/api/src/endpoints/v1/hook-remix/hook-remix.service.ts':
        'const batchId = randomUUID();',
      'apps/server/api/src/services/turbo-run/turbo-run.service.ts':
        'export class TurboRunService {}',
      'packages/contracts/src/legacy.ts': 'export enum BatchStatus {}',
    });

    expect(checkRetiredBatchNames({ rootDir })).toEqual([
      {
        file: 'packages/contracts/src/legacy.ts',
        line: 1,
        name: 'BatchStatus',
        replacement: 'Turbo*',
      },
    ]);
  });
});
