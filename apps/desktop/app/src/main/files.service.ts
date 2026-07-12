import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  DesktopAssetKind,
  DesktopAssetUploadPolicy,
  IDesktopAsset,
} from '@genfeedai/desktop-contracts';
import { buildDesktopAssetUrl } from '@genfeedai/desktop-contracts';
import {
  buildWorkspaceAssetsDir,
  resolvePathInsideRoot,
} from '@genfeedai/desktop-core';
import type { PrismaClient } from '@genfeedai/desktop-prisma';
import { dialog, shell } from 'electron';
import {
  extensionForDesktopAssetMimeType,
  inferDesktopAssetMimeType,
  validateDesktopAssetMimeType,
} from './asset-mime.util';
import { toDesktopAsset } from './desktop-asset.util';
import { toIso } from './time.util';
import type { DesktopWorkspaceService } from './workspace.service';

const LOCAL_ORGANIZATION_ID = 'local-org';

const inferAssetKind = (mimeType: string): DesktopAssetKind => {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
};

const sanitizeFilenamePart = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'asset';

const pathExists = async (targetPath: string): Promise<boolean> => {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const toRendererAsset = (asset: IDesktopAsset): IDesktopAsset => {
  const { localPath: _localPath, ...rendererAsset } = asset;
  return rendererAsset;
};

export type ResolvedDesktopAssetFile = {
  absolutePath: string;
  mimeType: string;
};

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
      const targetPath = await this.resolveAvailableImportPath(
        targetDirectory,
        fileName,
      );
      const targetFileName = path.basename(targetPath);
      await fs.copyFile(sourceFilePath, targetPath);
      importedAssets.push(
        await this.registerAsset({
          displayName: targetFileName,
          localPath: targetPath,
          mimeType: inferDesktopAssetMimeType(targetPath),
          origin: 'local-import',
          originalFileName: fileName,
          uploadPolicy: 'never',
          workspaceId,
        }),
      );
    }

    return importedAssets;
  }

  private async resolveAvailableImportPath(
    targetDirectory: string,
    fileName: string,
  ): Promise<string> {
    // Guard against path traversal: strip to basename only and reject names
    // that could escape the target directory after normalization.
    const safeBasename = path.basename(fileName);
    const parsed = path.parse(safeBasename);

    const resolvedBase = path.resolve(targetDirectory);
    let candidate = path.resolve(resolvedBase, safeBasename);

    if (
      !candidate.startsWith(resolvedBase + path.sep) &&
      candidate !== resolvedBase
    ) {
      throw new Error('Invalid file name: path traversal detected.');
    }

    let index = 1;

    while (await pathExists(candidate)) {
      const nextName = `${parsed.name}-${String(index)}${parsed.ext}`;
      candidate = path.resolve(resolvedBase, nextName);

      if (
        !candidate.startsWith(resolvedBase + path.sep) &&
        candidate !== resolvedBase
      ) {
        throw new Error('Invalid file name: path traversal detected.');
      }

      index += 1;
    }

    return candidate;
  }

  async getAssetUrl(assetId: string): Promise<string> {
    await this.resolveLocalAssetFile(assetId);
    return buildDesktopAssetUrl(assetId);
  }

  async resolveLocalAssetFile(
    assetId: string,
  ): Promise<ResolvedDesktopAssetFile> {
    const asset = await this.prisma.desktopAsset.findUnique({
      where: {
        id: assetId,
      },
    });

    if (!asset?.localPath || !asset.workspaceId) {
      throw new Error('Local asset file is not available.');
    }

    const workspace = this.workspaceService.getWorkspace(asset.workspaceId);
    const assetsRoot = buildWorkspaceAssetsDir(workspace.path);
    const absolutePath = resolvePathInsideRoot(assetsRoot, asset.localPath);
    const [realWorkspaceRoot, realAssetsRoot, realAssetPath] =
      await Promise.all([
        fs.realpath(workspace.path),
        fs.realpath(assetsRoot),
        fs.realpath(absolutePath),
      ]);
    resolvePathInsideRoot(realWorkspaceRoot, realAssetsRoot);
    resolvePathInsideRoot(realAssetsRoot, realAssetPath);

    const stats = await fs.stat(realAssetPath);
    if (
      !stats.isFile() ||
      !(await validateDesktopAssetMimeType(realAssetPath, asset.mimeType))
    ) {
      throw new Error('Local asset file type is invalid.');
    }

    return {
      absolutePath: realAssetPath,
      mimeType:
        asset.mimeType === 'image/svg+xml'
          ? 'application/octet-stream'
          : asset.mimeType,
    };
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

    return rows.map((row) => toRendererAsset(toDesktopAsset(row)));
  }

  async writeGeneratedAsset(
    options: GeneratedAssetWriteOptions,
  ): Promise<IDesktopAsset> {
    const workspace = this.workspaceService.getWorkspace(options.workspaceId);
    const targetDirectory = buildWorkspaceAssetsDir(workspace.path);
    await fs.mkdir(targetDirectory, { recursive: true });

    const extension = extensionForDesktopAssetMimeType(options.mimeType);
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

  async revealAsset(assetId: string): Promise<void> {
    const asset = await this.prisma.desktopAsset.findUnique({
      where: {
        id: assetId,
      },
    });

    if (!asset?.localPath) {
      throw new Error('Local asset file is not available.');
    }

    await this.revealPath(asset.localPath);
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

    return toRendererAsset(toDesktopAsset(row));
  }
}
