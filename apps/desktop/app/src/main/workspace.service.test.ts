import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  electronMockState,
  resetElectronMockState,
} from './test-support/electron.mock';

const { DesktopWorkspaceService } = await import('./workspace.service');

const createPrismaMock = () => {
  const workspacesById = new Map<string, Record<string, unknown>>();
  const recentItemsById = new Map<string, Record<string, unknown>>();

  return {
    desktopRecentItem: {
      findMany: async () =>
        Array.from(recentItemsById.values()).sort((left, right) =>
          String(right.openedAt).localeCompare(String(left.openedAt)),
        ),
      upsert: async ({
        create,
        update,
        where,
      }: {
        create: Record<string, unknown>;
        update: Record<string, unknown>;
        where: { id: string };
      }) => {
        recentItemsById.set(where.id, {
          ...(recentItemsById.get(where.id) ?? create),
          ...update,
          id: where.id,
        });
      },
    },
    desktopWorkspace: {
      findMany: async () =>
        Array.from(workspacesById.values()).sort((left, right) =>
          String(right.lastOpenedAt).localeCompare(String(left.lastOpenedAt)),
        ),
      findUnique: async ({ where }: { where: { id: string } }) =>
        workspacesById.get(where.id) ?? null,
      upsert: async ({
        create,
        update,
        where,
      }: {
        create: Record<string, unknown>;
        update: Record<string, unknown>;
        where: { id: string };
      }) => {
        workspacesById.set(where.id, {
          ...(workspacesById.get(where.id) ?? create),
          ...update,
          id: where.id,
        });
      },
    },
    recentItemsById,
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

    const prisma = createPrismaMock();
    const service = new DesktopWorkspaceService(prisma as never);
    await service.init();

    const workspace = await service.openWorkspace();

    expect(workspace).not.toBeNull();
    if (!workspace) {
      throw new Error('Expected workspace to open');
    }

    expect(workspace.name).toBe('content-workspace');
    expect(workspace.fileIndex.map((file) => file.relativePath)).toEqual(
      expect.arrayContaining(['README.md', path.join('notes', 'ideas.txt')]),
    );
    expect(
      workspace.fileIndex.some((file) => file.relativePath.includes('.git')),
    ).toBe(false);
    expect(fs.existsSync(path.join(workspaceDir, '.genfeed'))).toBe(true);
    expect(service.listRecents()[0]?.value).toBe(workspaceDir);
    expect(service.getWorkspace(workspace.id).path).toBe(workspaceDir);
  });

  it('links a project, resolves workspace paths, and reveals the folder in Finder', async () => {
    const workspaceDir = path.join(temporaryRoot, 'linked-workspace');
    fs.mkdirSync(workspaceDir, { recursive: true });

    const now = '2026-04-01T10:00:00.000Z';
    const prisma = createPrismaMock();
    prisma.workspacesById.set('workspace-1', {
      createdAt: now,
      fileIndex: '[]',
      id: 'workspace-1',
      indexingState: 'idle',
      lastOpenedAt: now,
      linkedBrandId: null,
      linkedProjectId: null,
      localDraftCount: 0,
      name: 'Linked Workspace',
      path: workspaceDir,
      pendingSyncCount: 0,
      syncPolicy: 'local-only',
      updatedAt: now,
    });

    const service = new DesktopWorkspaceService(prisma as never);
    await service.init();

    const linkedWorkspace = await service.linkProject(
      'workspace-1',
      'project-9',
    );

    expect(linkedWorkspace.linkedProjectId).toBe('project-9');
    expect(
      service.assertInsideWorkspace(
        'workspace-1',
        path.join('docs', 'plan.md'),
      ),
    ).toBe(path.join(workspaceDir, 'docs', 'plan.md'));

    await service.revealInFinder('workspace-1');
    expect(electronMockState.shell.revealedPaths).toEqual([workspaceDir]);
  });
});
