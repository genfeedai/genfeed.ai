import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  DesktopAssetKind,
  DesktopAssetUploadPolicy,
  IDesktopAsset,
} from '@genfeedai/desktop-contracts';
import { buildWorkspaceAssetsDir } from '@genfeedai/desktop-core';
import type { PrismaClient } from '@genfeedai/desktop-prisma';
import { dialog, shell } from 'electron';
import type { DesktopWorkspaceService } from './workspace.service';

const LOCAL_ORGANIZATION_ID = 'local-org';

const MIME_BY_EXTENSION: Record<string, string> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.webp': 'image/webp',
};

const ASSET_EXTENSION_BY_MIME: Record<string, string> = {
  'image/avif': '.avif',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/svg+xml': '.svg',
  'image/webp': '.webp',
};

const toIso = (): string => new Date().toISOString();

const inferMimeType = (filePath: string): string =>
  MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()] ??
  'application/octet-stream';

const inferAssetKind = (mimeType: string): DesktopAssetKind => {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
};

const extensionForMimeType = (mimeType: string): string =>
  ASSET_EXTENSION_BY_MIME[mimeType.toLowerCase()] ?? '.bin';

const sanitizeFilenamePart = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'asset';

const toDesktopAsset = (row: {
  brandId: string | null;
  cloudId: string | null;
  cloudObjectKey: string | null;
  createdAt: string;
  deletedAt: string | null;
  displayName: string;
  id: string;
  kind: string;
  localPath: string | null;
  mimeType: string;
  organizationId: string;
  origin: string;
  originalFileName: string;
  residency: string;
  sha256: string;
  sizeBytes: number;
  updatedAt: string;
  uploadPolicy: string;
  workspaceId: string | null;
}): IDesktopAsset => ({
  brandId: row.brandId ?? undefined,
  cloudId: row.cloudId ?? undefined,
  cloudObjectKey: row.cloudObjectKey ?? undefined,
  createdAt: row.createdAt,
  deletedAt: row.deletedAt ?? undefined,
  displayName: row.displayName,
  id: row.id,
  kind: row.kind as IDesktopAsset['kind'],
  localPath: row.localPath ?? undefined,
  mimeType: row.mimeType,
  organizationId: row.organizationId,
  origin: row.origin as IDesktopAsset['origin'],
  originalFileName: row.originalFileName,
  residency: row.residency as IDesktopAsset['residency'],
  sha256: row.sha256,
  sizeBytes: row.sizeBytes,
  updatedAt: row.updatedAt,
  uploadPolicy: row.uploadPolicy as IDesktopAsset['uploadPolicy'],
  workspaceId: row.workspaceId ?? undefined,
});

export interface GeneratedAssetWriteOptions {
  bytes: Uint8Array;
  displayName?: string;
  jobId: string;
  mimeType: string;
  model: string;
  provider: string;
  uploadPolicy?: DesktopAssetUploadPolicy;
  workspaceId: string;
}

export class DesktopFilesService {
  constructor(
    private readonly workspaceService: DesktopWorkspaceService,
    private readonly prisma: PrismaClient,
  ) {}

  async readFile(workspaceId: string, relativePath: string): Promise<string> {
    const absolutePath = this.workspaceService.assertInsideWorkspace(
      workspaceId,
      relativePath,
    );

    return fs.readFile(absolutePath, 'utf8');
  }

  async writeFile(
    workspaceId: string,
    relativePath: string,
    contents: string,
  ): Promise<void> {
    const absolutePath = this.workspaceService.assertInsideWorkspace(
      workspaceId,
      relativePath,
    );

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, contents, 'utf8');
  }

  async importAssets(
    workspaceId: string,
    filePaths?: string[],
  ): Promise<IDesktopAsset[]> {
    const workspace = this.workspaceService.getWorkspace(workspaceId);
    const selectedFilePaths =
      filePaths && filePaths.length > 0
        ? filePaths
        : (
            await dialog.showOpenDialog({
              buttonLabel: 'Import Assets',
              properties: ['openFile', 'multiSelections'],
              title: 'Import Assets to Workspace',
            })
          ).filePaths;

    if (selectedFilePaths.length === 0) {
      return [];
    }

    const targetDirectory = buildWorkspaceAssetsDir(workspace.path);
    await fs.mkdir(targetDirectory, { recursive: true });

    const importedAssets: IDesktopAsset[] = [];

    for (const sourceFilePath of selectedFilePaths) {
      const fileName = path.basename(sourceFilePath);
      const targetPath = path.join(targetDirectory, fileName);
      await fs.copyFile(sourceFilePath, targetPath);
      importedAssets.push(
        await this.registerAsset({
          displayName: fileName,
          localPath: targetPath,
          mimeType: inferMimeType(targetPath),
          origin: 'local-import',
          originalFileName: fileName,
          uploadPolicy: 'never',
          workspaceId,
        }),
      );
    }

    return importedAssets;
  }

  async getAssetUrl(assetId: string): Promise<string> {
    const asset = await this.prisma.desktopAsset.findUnique({
      where: {
        id: assetId,
      },
    });

    if (!asset?.localPath) {
      throw new Error('Local asset file is not available.');
    }

    return pathToFileURL(asset.localPath).toString();
  }

  async listAssets(workspaceId?: string): Promise<IDesktopAsset[]> {
    const rows = await this.prisma.desktopAsset.findMany({
      orderBy: {
        updatedAt: 'desc',
      },
      where: workspaceId
        ? {
            workspaceId,
          }
        : undefined,
    });

    return rows.map(toDesktopAsset);
  }

  async writeGeneratedAsset(
    options: GeneratedAssetWriteOptions,
  ): Promise<IDesktopAsset> {
    const workspace = this.workspaceService.getWorkspace(options.workspaceId);
    const targetDirectory = buildWorkspaceAssetsDir(workspace.path);
    await fs.mkdir(targetDirectory, { recursive: true });

    const extension = extensionForMimeType(options.mimeType);
    const filename = `${sanitizeFilenamePart(options.provider)}-${sanitizeFilenamePart(options.model)}-${options.jobId}${extension}`;
    const targetPath = path.join(targetDirectory, filename);
    await fs.writeFile(targetPath, Buffer.from(options.bytes));

    return this.registerAsset({
      displayName: options.displayName ?? filename,
      localPath: targetPath,
      mimeType: options.mimeType,
      origin: 'local-generation',
      originalFileName: filename,
      uploadPolicy: options.uploadPolicy ?? 'never',
      workspaceId: options.workspaceId,
    });
  }

  async revealPath(targetPath: string): Promise<void> {
    await shell.showItemInFolder(targetPath);
  }

  private async registerAsset(params: {
    displayName: string;
    localPath: string;
    mimeType: string;
    origin: IDesktopAsset['origin'];
    originalFileName: string;
    uploadPolicy: DesktopAssetUploadPolicy;
    workspaceId: string;
  }): Promise<IDesktopAsset> {
    const contents = await fs.readFile(params.localPath);
    const now = toIso();
    const row = {
      brandId: null,
      cloudId: null,
      cloudObjectKey: null,
      createdAt: now,
      deletedAt: null,
      displayName: params.displayName,
      id: randomUUID(),
      kind: inferAssetKind(params.mimeType),
      localPath: params.localPath,
      mimeType: params.mimeType,
      organizationId: LOCAL_ORGANIZATION_ID,
      origin: params.origin,
      originalFileName: params.originalFileName,
      residency: 'local-only',
      sha256: createHash('sha256').update(contents).digest('hex'),
      sizeBytes: contents.byteLength,
      updatedAt: now,
      uploadPolicy: params.uploadPolicy,
      workspaceId: params.workspaceId,
    };

    await this.prisma.desktopAsset.upsert({
      create: row,
      update: row,
      where: {
        id: row.id,
      },
    });

    return toDesktopAsset(row);
  }
}
