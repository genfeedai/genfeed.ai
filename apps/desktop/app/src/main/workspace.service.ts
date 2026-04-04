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
import { dialog, shell } from 'electron';
import {
  CloudDatabaseService,
  type WorkspaceRow,
} from './cloud-database.service';

const toIso = (): string => new Date().toISOString();

export class DesktopWorkspaceService {
  constructor(private readonly database: CloudDatabaseService) {}

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

        if (entry.name.startsWith('.git')) {
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

  private toWorkspace(row: WorkspaceRow): IDesktopWorkspace {
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

  private persistWorkspace(input: {
    id?: string;
    linkedProjectId?: string;
    name: string;
    path: string;
  }): IDesktopWorkspace {
    this.ensureWorkspaceMetadataFolder(input.path);
    const now = toIso();
    const existing = this.database
      .listWorkspaces()
      .find((workspace) => workspace.path === input.path);
    const fileIndex = this.indexWorkspaceFiles(input.path);

    const row: WorkspaceRow = {
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

    this.database.upsertWorkspace(row);
    this.database.upsertRecentItem({
      id: row.id,
      kind: 'workspace',
      label: row.name,
      openedAt: now,
      value: row.path,
    });

    return this.toWorkspace(row);
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
    });
  }

  listRecentWorkspaces(): IDesktopWorkspace[] {
    return this.database.listWorkspaces().map((row) => this.toWorkspace(row));
  }

  getWorkspace(id: string): IDesktopWorkspace {
    const row = this.database.getWorkspaceById(id);

    if (!row) {
      throw new Error(`Workspace not found: ${id}`);
    }

    return this.toWorkspace(row);
  }

  linkProject(workspaceId: string, projectId: string): IDesktopWorkspace {
    const workspace = this.getWorkspace(workspaceId);

    return this.persistWorkspace({
      id: workspace.id,
      linkedProjectId: projectId,
      name: workspace.name,
      path: workspace.path,
    });
  }

  revealInFinder(workspaceId: string): void {
    const workspace = this.getWorkspace(workspaceId);
    void shell.showItemInFolder(workspace.path);
  }

  assertInsideWorkspace(workspaceId: string, relativePath: string): string {
    const workspace = this.getWorkspace(workspaceId);
    return resolvePathInsideRoot(workspace.path, relativePath);
  }

  listRecents(): IDesktopRecentItem[] {
    return this.database.listRecentItems().map((item) => ({
      id: item.id,
      kind: item.kind as 'project' | 'workspace',
      label: item.label,
      openedAt: item.openedAt,
      value: item.value,
    }));
  }
}
