import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { IDesktopAsset } from '@genfeedai/desktop-contracts';
import { buildWorkspaceAssetsDir } from '@genfeedai/desktop-core';
import { dialog, shell } from 'electron';
import type { DesktopDatabaseService } from './database.service';
import type { DesktopWorkspaceService } from './workspace.service';

const LOCAL_ORGANIZATION_ID = 'desktop-local-org';
const LOCAL_DEFAULT_BRAND_ID = 'desktop-local-brand';

const toIso = (): string => new Date().toISOString();

function inferMimeType(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();

  if (['.jpg', '.jpeg'].includes(extension)) return 'image/jpeg';
  if (extension === '.png') return 'image/png';
  if (extension === '.gif') return 'image/gif';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.mp4') return 'video/mp4';
  if (extension === '.mov') return 'video/quicktime';
  if (extension === '.mp3') return 'audio/mpeg';
  if (extension === '.wav') return 'audio/wav';
  if (extension === '.pdf') return 'application/pdf';

  return 'application/octet-stream';
}

function inferAssetKind(mimeType: string): IDesktopAsset['kind'] {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

async function hashFile(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}

export class DesktopFilesService {
  constructor(
    private readonly workspaceService: DesktopWorkspaceService,
    private readonly database: DesktopDatabaseService,
  ) {}

  async readFile(workspaceId: string, relativePath: string): Promise<string> {
    const absolutePath = await this.workspaceService.assertInsideWorkspace(
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
    const absolutePath = await this.workspaceService.assertInsideWorkspace(
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
    const workspace = await this.workspaceService.getWorkspace(workspaceId);
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
      const stats = await fs.stat(sourceFilePath);
      const sha256 = await hashFile(sourceFilePath);
      const targetPath = path.join(targetDirectory, `${sha256}-${fileName}`);
      const mimeType = inferMimeType(fileName);
      const now = toIso();
      const existingAsset = (await this.database.listAssets(workspaceId)).find(
        (asset) => asset.sha256 === sha256 && asset.sizeBytes === stats.size,
      );

      if (existingAsset) {
        importedAssets.push(existingAsset);
        continue;
      }

      await fs.copyFile(sourceFilePath, targetPath);

      const asset: IDesktopAsset = {
        brandId: workspace.linkedBrandId ?? LOCAL_DEFAULT_BRAND_ID,
        createdAt: now,
        displayName: fileName,
        id: randomUUID(),
        kind: inferAssetKind(mimeType),
        localPath: targetPath,
        mimeType,
        organizationId: LOCAL_ORGANIZATION_ID,
        origin: 'local-import',
        originalFileName: fileName,
        residency: 'local-only',
        sha256,
        sizeBytes: stats.size,
        updatedAt: now,
        uploadPolicy:
          workspace.syncPolicy === 'full-asset-sync'
            ? 'full'
            : workspace.syncPolicy === 'metadata-sync'
              ? 'metadata-only'
              : 'never',
        workspaceId,
      };

      await this.database.upsertAsset(asset);
      importedAssets.push(asset);
    }

    return importedAssets;
  }

  async listAssets(workspaceId?: string): Promise<IDesktopAsset[]> {
    return this.database.listAssets(workspaceId);
  }

  async getAssetUrl(assetId: string): Promise<string> {
    const asset = await this.database.getAsset(assetId);

    if (!asset?.localPath) {
      throw new Error('Asset is not available on this device.');
    }

    return `genfeed-asset://local/${encodeURIComponent(asset.id)}`;
  }

  async revealPath(targetPath: string): Promise<void> {
    await shell.showItemInFolder(targetPath);
  }
}
