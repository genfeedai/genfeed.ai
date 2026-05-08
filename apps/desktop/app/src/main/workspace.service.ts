import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  IDesktopRecentItem,
  IDesktopWorkspace,
  IDesktopWorkspaceFile,
} from '@genfeedai/desktop-contracts';
import {
  buildWorkspaceMetadataDir,
  DEFAULT_MAX_INDEXED_FILES,
  resolvePathInsideRoot,
} from '@genfeedai/desktop-core';
import type { PrismaClient } from '@genfeedai/desktop-prisma';
import { dialog, shell } from 'electron';

const toIso = (): string => new Date().toISOString();
const SKIPPED_INDEX_DIRECTORIES = new Set([
  '.cache',
  '.git',
  '.genfeed',
  '.next',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'release',
]);

export class DesktopWorkspaceService {
  private readonly recents = new Map<string, IDesktopRecentItem>();
  private readonly workspaces = new Map<string, IDesktopWorkspace>();

  constructor(private readonly prisma: PrismaClient) {}

  async init(): Promise<void> {
    const [workspaceRows, recentRows] = await Promise.all([
      this.prisma.desktopWorkspace.findMany({
        orderBy: {
          lastOpenedAt: 'desc',
        },
      }),
      this.prisma.desktopRecentItem.findMany({
        orderBy: {
          openedAt: 'desc',
        },
      }),
    ]);

    this.workspaces.clear();
    for (const row of workspaceRows) {
      this.workspaces.set(row.id, this.toWorkspace(row));
    }

    this.recents.clear();
    for (const row of recentRows) {
      this.recents.set(row.id, {
        id: row.id,
        kind: row.kind as 'project' | 'workspace',
        label: row.label,
        openedAt: row.openedAt,
        value: row.value,
      });
    }
  }

  private ensureWorkspaceMetadataFolder(workspacePath: string): void {
    fs.mkdirSync(buildWorkspaceMetadataDir(workspacePath), {
      recursive: true,
    });
  }

  private indexWorkspaceFiles(workspacePath: string): IDesktopWorkspaceFile[] {
    const files: IDesktopWorkspaceFile[] = [];

    const walk = (currentPath: string): void => {
      if (files.length >= DEFAULT_MAX_INDEXED_FILES) {
        return;
      }

      const entries = fs.readdirSync(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (files.length >= DEFAULT_MAX_INDEXED_FILES) {
          return;
        }

        if (entry.isDirectory() && SKIPPED_INDEX_DIRECTORIES.has(entry.name)) {
          continue;
        }

        const absolutePath = path.join(currentPath, entry.name);
        const relativePath = path.relative(workspacePath, absolutePath);

        if (entry.isDirectory()) {
          walk(absolutePath);
          continue;
        }

        const stats = fs.statSync(absolutePath);
        files.push({
          extension: path.extname(entry.name),
          name: entry.name,
          path: absolutePath,
          relativePath,
          size: stats.size,
          updatedAt: stats.mtime.toISOString(),
        });
      }
    };

    walk(workspacePath);

    return files;
  }

  private toWorkspace(row: {
    createdAt: string;
    fileIndex: string;
    id: string;
    indexingState: string;
    lastOpenedAt: string;
    linkedProjectId: string | null;
    localDraftCount: number;
    name: string;
    path: string;
    pendingSyncCount: number;
    updatedAt: string;
  }): IDesktopWorkspace {
    return {
      createdAt: row.createdAt,
      fileIndex: JSON.parse(row.fileIndex) as IDesktopWorkspaceFile[],
      id: row.id,
      indexingState: row.indexingState as 'idle' | 'indexing',
      lastOpenedAt: row.lastOpenedAt,
      linkedProjectId: row.linkedProjectId ?? undefined,
      localDraftCount: row.localDraftCount,
      name: row.name,
      path: row.path,
      pendingSyncCount: row.pendingSyncCount,
      updatedAt: row.updatedAt,
    };
  }

  private listWorkspaceCache(): IDesktopWorkspace[] {
    return Array.from(this.workspaces.values()).sort((left, right) =>
      right.lastOpenedAt.localeCompare(left.lastOpenedAt),
    );
  }

  private listRecentCache(): IDesktopRecentItem[] {
    return Array.from(this.recents.values()).sort((left, right) =>
      right.openedAt.localeCompare(left.openedAt),
    );
  }

  private async persistWorkspace(input: {
    id?: string;
    linkedProjectId?: string;
    name: string;
    path: string;
    reindex?: boolean;
  }): Promise<IDesktopWorkspace> {
    this.ensureWorkspaceMetadataFolder(input.path);
    const now = toIso();
    const existing = this.listWorkspaceCache().find(
      (workspace) => workspace.path === input.path,
    );
    const shouldReindex = input.reindex ?? true;
    const fileIndex =
      !shouldReindex && existing
        ? existing.fileIndex
        : this.indexWorkspaceFiles(input.path);

    const row = {
      createdAt: existing?.createdAt ?? now,
      fileIndex: JSON.stringify(fileIndex),
      id: existing?.id ?? input.id ?? randomUUID(),
      indexingState: 'idle',
      lastOpenedAt: now,
      linkedProjectId:
        input.linkedProjectId ?? existing?.linkedProjectId ?? null,
      localDraftCount: existing?.localDraftCount ?? 0,
      name: input.name,
      path: input.path,
      pendingSyncCount: existing?.pendingSyncCount ?? 0,
      updatedAt: now,
    };

    await this.prisma.desktopWorkspace.upsert({
      create: row,
      update: row,
      where: {
        id: row.id,
      },
    });

    await this.prisma.desktopRecentItem.upsert({
      create: {
        id: row.id,
        kind: 'workspace',
        label: row.name,
        openedAt: now,
        value: row.path,
      },
      update: {
        kind: 'workspace',
        label: row.name,
        openedAt: now,
        value: row.path,
      },
      where: {
        id: row.id,
      },
    });

    const workspace = this.toWorkspace(row);
    this.workspaces.set(workspace.id, workspace);
    this.recents.set(workspace.id, {
      id: workspace.id,
      kind: 'workspace',
      label: workspace.name,
      openedAt: now,
      value: workspace.path,
    });

    return workspace;
  }

  async openWorkspace(): Promise<IDesktopWorkspace | null> {
    const result = await dialog.showOpenDialog({
      buttonLabel: 'Open Workspace',
      properties: ['openDirectory', 'createDirectory'],
      title: 'Open Genfeed Workspace',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const workspacePath = result.filePaths[0];
    return this.persistWorkspace({
      name: path.basename(workspacePath),
      path: workspacePath,
      reindex: true,
    });
  }

  listRecentWorkspaces(): IDesktopWorkspace[] {
    return this.listWorkspaceCache();
  }

  getWorkspace(id: string): IDesktopWorkspace {
    const workspace = this.workspaces.get(id);

    if (!workspace) {
      throw new Error(`Workspace not found: ${id}`);
    }

    return workspace;
  }

  async linkProject(
    workspaceId: string,
    projectId: string,
  ): Promise<IDesktopWorkspace> {
    const workspace = this.getWorkspace(workspaceId);

    return this.persistWorkspace({
      id: workspace.id,
      linkedProjectId: projectId,
      name: workspace.name,
      path: workspace.path,
      reindex: false,
    });
  }

  async revealInFinder(workspaceId: string): Promise<void> {
    const workspace = this.getWorkspace(workspaceId);
    void shell.showItemInFolder(workspace.path);
  }

  assertInsideWorkspace(workspaceId: string, relativePath: string): string {
    const workspace = this.getWorkspace(workspaceId);
    return resolvePathInsideRoot(workspace.path, relativePath);
  }

  listRecents(): IDesktopRecentItem[] {
    return this.listRecentCache();
  }
}
