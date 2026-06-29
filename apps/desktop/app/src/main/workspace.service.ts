import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  IDesktopRecentItem,
  IDesktopWorkspace,
  IDesktopWorkspaceCloudLink,
  IDesktopWorkspaceCloudLinkInput,
  IDesktopWorkspaceFile,
} from '@genfeedai/desktop-contracts';
import {
  buildWorkspaceMetadataDir,
  DEFAULT_MAX_INDEXED_FILES,
  resolvePathInsideRoot,
} from '@genfeedai/desktop-core';
import type { PrismaClient } from '@genfeedai/desktop-prisma';
import { dialog, shell } from 'electron';
import { toIso } from './time.util';

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

export interface DesktopLocalCloudIdentityContext {
  cloudUserId?: string | null;
  localDeviceId: string;
  localUserId: string;
}

const normalizeNullableString = (value: string | null | undefined) =>
  value && value.length > 0 ? value : null;

export class DesktopWorkspaceService {
  private readonly cloudLinks = new Map<string, IDesktopWorkspaceCloudLink>();
  private readonly recents = new Map<string, IDesktopRecentItem>();
  private readonly workspaces = new Map<string, IDesktopWorkspace>();

  constructor(private readonly prisma: PrismaClient) {}

  async init(): Promise<void> {
    const [workspaceRows, recentRows, cloudLinkRows] = await Promise.all([
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
      this.prisma.desktopWorkspaceCloudLink.findMany(),
    ]);

    this.cloudLinks.clear();
    for (const row of cloudLinkRows) {
      this.cloudLinks.set(row.workspaceId, this.toCloudLink(row));
    }

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
    linkedBrandId: string | null;
    linkedOrganizationId: string | null;
    linkedProjectId: string | null;
    localDraftCount: number;
    name: string;
    path: string;
    pendingSyncCount: number;
    syncPolicy: string;
    updatedAt: string;
  }): IDesktopWorkspace {
    const cloudLink = this.cloudLinks.get(row.id);

    return {
      createdAt: row.createdAt,
      fileIndex: JSON.parse(row.fileIndex) as IDesktopWorkspaceFile[],
      ...(cloudLink ? { cloudLink } : {}),
      id: row.id,
      indexingState: row.indexingState as 'idle' | 'indexing',
      lastOpenedAt: row.lastOpenedAt,
      linkedBrandId: row.linkedBrandId ?? cloudLink?.cloudBrandId ?? undefined,
      linkedOrganizationId:
        row.linkedOrganizationId ?? cloudLink?.cloudOrganizationId ?? undefined,
      linkedProjectId:
        row.linkedProjectId ?? cloudLink?.cloudProjectId ?? undefined,
      localDraftCount: row.localDraftCount,
      name: row.name,
      path: row.path,
      pendingSyncCount: row.pendingSyncCount,
      syncPolicy: row.syncPolicy as IDesktopWorkspace['syncPolicy'],
      updatedAt: row.updatedAt,
    };
  }

  private toCloudLink(row: {
    cloudBrandId: string | null;
    cloudOrganizationId: string | null;
    cloudProjectId: string | null;
    cloudUserId: string | null;
    linkedAt: string;
    localDeviceId: string;
    localUserId: string;
    syncPolicy: string;
    updatedAt: string;
    workspaceId: string;
  }): IDesktopWorkspaceCloudLink {
    return {
      cloudBrandId: row.cloudBrandId ?? undefined,
      cloudOrganizationId: row.cloudOrganizationId ?? undefined,
      cloudProjectId: row.cloudProjectId ?? undefined,
      cloudUserId: row.cloudUserId ?? undefined,
      linkedAt: row.linkedAt,
      localDeviceId: row.localDeviceId,
      localUserId: row.localUserId,
      syncPolicy: row.syncPolicy as IDesktopWorkspaceCloudLink['syncPolicy'],
      updatedAt: row.updatedAt,
      workspaceId: row.workspaceId,
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
    linkedBrandId?: string | null;
    linkedOrganizationId?: string | null;
    linkedProjectId?: string | null;
    name: string;
    path: string;
    reindex?: boolean;
    syncPolicy?: IDesktopWorkspace['syncPolicy'];
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
      linkedBrandId:
        input.linkedBrandId !== undefined
          ? input.linkedBrandId
          : (existing?.linkedBrandId ?? null),
      linkedOrganizationId:
        input.linkedOrganizationId !== undefined
          ? input.linkedOrganizationId
          : (existing?.linkedOrganizationId ?? null),
      linkedProjectId:
        input.linkedProjectId !== undefined
          ? input.linkedProjectId
          : (existing?.linkedProjectId ?? null),
      localDraftCount: existing?.localDraftCount ?? 0,
      name: input.name,
      path: input.path,
      pendingSyncCount: existing?.pendingSyncCount ?? 0,
      syncPolicy: input.syncPolicy ?? existing?.syncPolicy ?? 'local-only',
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
    projectId: string | null,
    identity?: DesktopLocalCloudIdentityContext,
  ): Promise<IDesktopWorkspace> {
    if (identity) {
      return this.linkCloudContext(
        workspaceId,
        { cloudProjectId: projectId },
        identity,
      );
    }

    const workspace = this.getWorkspace(workspaceId);

    return this.persistWorkspace({
      id: workspace.id,
      linkedProjectId: normalizeNullableString(projectId),
      name: workspace.name,
      path: workspace.path,
      reindex: false,
    });
  }

  async linkCloudContext(
    workspaceId: string,
    input: IDesktopWorkspaceCloudLinkInput,
    identity: DesktopLocalCloudIdentityContext,
  ): Promise<IDesktopWorkspace> {
    const workspace = this.getWorkspace(workspaceId);
    const existingLink = this.cloudLinks.get(workspaceId);
    const cloudOrganizationId =
      input.cloudOrganizationId !== undefined
        ? normalizeNullableString(input.cloudOrganizationId)
        : (existingLink?.cloudOrganizationId ??
          workspace.linkedOrganizationId ??
          null);
    const cloudBrandId =
      input.cloudBrandId !== undefined
        ? normalizeNullableString(input.cloudBrandId)
        : (existingLink?.cloudBrandId ?? workspace.linkedBrandId ?? null);
    const cloudProjectId =
      input.cloudProjectId !== undefined
        ? normalizeNullableString(input.cloudProjectId)
        : (existingLink?.cloudProjectId ?? workspace.linkedProjectId ?? null);
    const syncPolicy =
      input.syncPolicy ?? existingLink?.syncPolicy ?? workspace.syncPolicy;
    const now = toIso();
    const linkedAt = existingLink?.linkedAt ?? now;

    const nextWorkspace = await this.persistWorkspace({
      id: workspace.id,
      linkedBrandId: cloudBrandId,
      linkedOrganizationId: cloudOrganizationId,
      linkedProjectId: cloudProjectId,
      name: workspace.name,
      path: workspace.path,
      reindex: false,
      syncPolicy,
    });

    const row = {
      cloudBrandId,
      cloudOrganizationId,
      cloudProjectId,
      cloudUserId:
        normalizeNullableString(identity.cloudUserId) ??
        existingLink?.cloudUserId ??
        null,
      linkedAt,
      localDeviceId: identity.localDeviceId,
      localUserId: identity.localUserId,
      syncPolicy,
      updatedAt: now,
      workspaceId,
    };

    await this.prisma.desktopWorkspaceCloudLink.upsert({
      create: row,
      update: row,
      where: {
        workspaceId,
      },
    });

    const cloudLink = this.toCloudLink(row);
    this.cloudLinks.set(workspaceId, cloudLink);
    const linkedWorkspace = {
      ...nextWorkspace,
      cloudLink,
      linkedBrandId: cloudBrandId ?? undefined,
      linkedOrganizationId: cloudOrganizationId ?? undefined,
      linkedProjectId: cloudProjectId ?? undefined,
      syncPolicy,
    };
    this.workspaces.set(workspaceId, linkedWorkspace);

    return linkedWorkspace;
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
