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
import type { DesktopDatabaseService, WorkspaceRow } from './database.service';

const toIso = (): string => new Date().toISOString();

export class DesktopWorkspaceService {
  constructor(private readonly database: DesktopDatabaseService) {}

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

  private async persistWorkspace(input: {
    id?: string;
    linkedProjectId?: string;
    name: string;
    path: string;
  }): Promise<IDesktopWorkspace> {
    this.ensureWorkspaceMetadataFolder(input.path);
    const now = toIso();
    const workspaces = await this.database.listWorkspaces();
    const existing = workspaces.find(
      (workspace) => workspace.path === input.path,
    );
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

    await this.database.upsertWorkspace(row);
    await this.database.upsertRecentItem({
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

  async listRecentWorkspaces(): Promise<IDesktopWorkspace[]> {
    const workspaces = await this.database.listWorkspaces();
    return workspaces.map((row) => this.toWorkspace(row));
  }

  async getWorkspace(id: string): Promise<IDesktopWorkspace> {
    const row = await this.database.getWorkspaceById(id);

    if (!row) {
      throw new Error(`Workspace not found: ${id}`);
    }

    return this.toWorkspace(row);
  }

  async linkProject(
    workspaceId: string,
    projectId: string,
  ): Promise<IDesktopWorkspace> {
    const workspace = await this.getWorkspace(workspaceId);

    return this.persistWorkspace({
      id: workspace.id,
      linkedProjectId: projectId,
      name: workspace.name,
      path: workspace.path,
    });
  }

  async revealInFinder(workspaceId: string): Promise<void> {
    const workspace = await this.getWorkspace(workspaceId);
    void shell.showItemInFolder(workspace.path);
  }

  async assertInsideWorkspace(
    workspaceId: string,
    relativePath: string,
  ): Promise<string> {
    const workspace = await this.getWorkspace(workspaceId);
    return resolvePathInsideRoot(workspace.path, relativePath);
  }

  async listRecents(): Promise<IDesktopRecentItem[]> {
    const recentItems = await this.database.listRecentItems();
    return recentItems.map((item) => ({
      id: item.id,
      kind: item.kind as 'project' | 'workspace',
      label: item.label,
      openedAt: item.openedAt,
      value: item.value,
    }));
  }
}
