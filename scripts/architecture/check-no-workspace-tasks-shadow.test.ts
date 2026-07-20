import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkNoWorkspaceTasksShadow } from './check-no-workspace-tasks-shadow';

const testDirs: string[] = [];

afterEach(() => {
  for (const testDir of testDirs.splice(0)) {
    rmSync(testDir, { force: true, recursive: true });
  }
});

function fixture(files: Record<string, string>): string {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'workspace-tasks-shadow-'));
  testDirs.push(rootDir);

  for (const [file, source] of Object.entries(files)) {
    const absolutePath = path.join(rootDir, file);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, source);
  }

  return rootDir;
}

describe('retired workspace-tasks shadow guard', () => {
  it('accepts the canonical tasks collection', () => {
    const rootDir = fixture({
      'apps/server/api/src/collections/tasks/tasks.module.ts':
        "import { TasksService } from '@api/collections/tasks/services/tasks.service';",
    });

    expect(checkNoWorkspaceTasksShadow({ rootDir })).toEqual([]);
  });

  it('rejects the retired workspace-tasks directory', () => {
    const rootDir = fixture({
      'apps/server/api/src/collections/workspace-tasks/services/workspace-tasks.service.ts':
        'export class WorkspaceTasksService {}',
    });

    expect(checkNoWorkspaceTasksShadow({ rootDir })).toContainEqual({
      kind: 'retired-directory',
      path: 'apps/server/api/src/collections/workspace-tasks',
    });
  });

  it('rejects imports from the retired collection', () => {
    const rootDir = fixture({
      'apps/server/api/src/example.ts':
        "import { WorkspaceTasksService } from '@api/collections/workspace-tasks/services/workspace-tasks.service';",
    });

    expect(checkNoWorkspaceTasksShadow({ rootDir })).toEqual([
      {
        file: 'apps/server/api/src/example.ts',
        kind: 'retired-import',
        line: 1,
      },
    ]);
  });
});
