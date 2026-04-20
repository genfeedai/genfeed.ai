import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DesktopDatabaseService, WorkspaceRow } from './database.service';
import {
  electronMockState,
  resetElectronMockState,
} from './test-support/electron.mock';

type RecentItemRow = {
  id: string;
  kind: string;
  label: string;
  openedAt: string;
  value: string;
};

const { DesktopWorkspaceService } = await import('./workspace.service');

const createDatabaseMock = () => {
  const workspacesById = new Map<string, WorkspaceRow>();
  const recentItemsById = new Map<string, RecentItemRow>();

  return {
    getWorkspaceById: async (workspaceId: string) =>
      workspacesById.get(workspaceId) ?? null,
    listRecentItems: async () =>
      Array.from(recentItemsById.values()).sort((left, right) =>
        right.openedAt.localeCompare(left.openedAt),
      ),
    listWorkspaces: async () =>
      Array.from(workspacesById.values()).sort((left, right) =>
        right.lastOpenedAt.localeCompare(left.lastOpenedAt),
      ),
    upsertRecentItem: async (item: RecentItemRow) => {
      recentItemsById.set(item.id, item);
    },
    upsertWorkspace: async (workspace: WorkspaceRow) => {
      workspacesById.set(workspace.id, workspace);
    },
    workspacesById,
  };
};

describe('DesktopWorkspaceService', () => {
  let temporaryRoot: string;

  beforeEach(() => {
    temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'genfeed-desktop-workspace-'),
    );
    resetElectronMockState();
  });

  afterEach(() => {
    fs.rmSync(temporaryRoot, { force: true, recursive: true });
  });

  it('opens a workspace, indexes files, and creates the metadata directory', async () => {
    const workspaceDir = path.join(temporaryRoot, 'content-workspace');
    const nestedDir = path.join(workspaceDir, 'notes');
    const gitDir = path.join(workspaceDir, '.git');

    fs.mkdirSync(nestedDir, { recursive: true });
    fs.mkdirSync(gitDir, { recursive: true });
    fs.writeFileSync(path.join(workspaceDir, 'README.md'), '# Desktop');
    fs.writeFileSync(path.join(nestedDir, 'ideas.txt'), 'ship it');
    fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main');

    electronMockState.dialog.openResult = {
      canceled: false,
      filePaths: [workspaceDir],
    };

    const database = createDatabaseMock();
    const service = new DesktopWorkspaceService(
      database as unknown as DesktopDatabaseService,
    );

    const workspace = await service.openWorkspace();

    expect(workspace).not.toBeNull();
    expect(workspace?.name).toBe('content-workspace');
    expect(workspace?.fileIndex.map((file) => file.relativePath)).toEqual(
      expect.arrayContaining(['README.md', path.join('notes', 'ideas.txt')]),
    );
    expect(
      workspace?.fileIndex.some((file) => file.relativePath.includes('.git')),
    ).toBe(false);
    expect(fs.existsSync(path.join(workspaceDir, '.genfeed'))).toBe(true);
    expect((await service.listRecents())[0]?.value).toBe(workspaceDir);
  });

  it('links a project, resolves workspace paths, and reveals the folder in Finder', async () => {
    const workspaceDir = path.join(temporaryRoot, 'linked-workspace');
    fs.mkdirSync(workspaceDir, { recursive: true });

    const now = '2026-04-01T10:00:00.000Z';
    const database = createDatabaseMock();
    await database.upsertWorkspace({
      createdAt: now,
      fileIndex: '[]',
      id: 'workspace-1',
      indexingState: 'idle',
      lastOpenedAt: now,
      linkedProjectId: null,
      localDraftCount: 0,
      name: 'Linked Workspace',
      path: workspaceDir,
      pendingSyncCount: 0,
      updatedAt: now,
    });

    const service = new DesktopWorkspaceService(
      database as unknown as DesktopDatabaseService,
    );

    const linkedWorkspace = await service.linkProject(
      'workspace-1',
      'project-9',
    );

    expect(linkedWorkspace.linkedProjectId).toBe('project-9');
    expect(
      await service.assertInsideWorkspace(
        'workspace-1',
        path.join('docs', 'plan.md'),
      ),
    ).toBe(path.join(workspaceDir, 'docs', 'plan.md'));

    await service.revealInFinder('workspace-1');
    expect(electronMockState.shell.revealedPaths).toEqual([workspaceDir]);
  });
});
