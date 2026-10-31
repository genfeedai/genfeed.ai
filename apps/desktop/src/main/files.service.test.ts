import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  electronMockState,
  resetElectronMockState,
} from './test-support/electron.mock';
import type { DesktopWorkspaceService } from './workspace.service';

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const createPrismaMock = () => {
  const assets = new Map<string, Record<string, unknown>>();

  return {
    assets,
    desktopAsset: {
      findMany: async () =>
        Array.from(assets.values()).sort((left, right) =>
          String(right.updatedAt).localeCompare(String(left.updatedAt)),
        ),
      findUnique: async ({ where }: { where: { id: string } }) =>
        assets.get(where.id) ?? null,
      upsert: async ({
        create,
        update,
        where,
      }: {
        create: Record<string, unknown>;
        update: Record<string, unknown>;
        where: { id: string };
      }) => {
        assets.set(where.id, {
          ...(assets.get(where.id) ?? create),
          ...update,
          id: where.id,
        });
      },
    },
  };
};

describe('DesktopFilesService', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'genfeed-files-'));
    resetElectronMockState();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { force: true, recursive: true });
  });

  it('writes generated assets to the workspace and registers local-only metadata', async () => {
    const { DesktopFilesService } = await import('./files.service');
    const prisma = createPrismaMock();
    const workspaceService = {
      getWorkspace: () => ({
        path: tmpDir,
      }),
    };
    const service = new DesktopFilesService(
      workspaceService as DesktopWorkspaceService,
      prisma as never,
    );

    const asset = await service.writeGeneratedAsset({
      bytes: PNG_BYTES,
      jobId: 'job-1',
      mimeType: 'image/png',
      model: 'black-forest-labs/flux-schnell',
      provider: 'replicate',
      workspaceId: 'ws-1',
    });

    expect(asset).toMatchObject({
      kind: 'image',
      mimeType: 'image/png',
      origin: 'local-generation',
      residency: 'local-only',
      uploadPolicy: 'never',
      workspaceId: 'ws-1',
    });
    expect(asset.localPath).toBeUndefined();
    const storedAsset = prisma.assets.get(asset.id);
    const storedLocalPath = String(storedAsset?.localPath);
    expect(storedLocalPath).toContain(
      path.join(
        '.genfeed',
        'assets',
        'replicate-black-forest-labs-flux-schnell-job-1.png',
      ),
    );
    await expect(fs.readFile(storedLocalPath)).resolves.toEqual(
      Buffer.from(PNG_BYTES),
    );
    await expect(service.listAssets('ws-1')).resolves.toHaveLength(1);
    await expect(service.getAssetUrl(asset.id)).resolves.toBe(
      `genfeed-asset://local/${asset.id}`,
    );
  });

  it('imports duplicate filenames without overwriting prior local assets', async () => {
    const { DesktopFilesService } = await import('./files.service');
    const prisma = createPrismaMock();
    const workspaceService = {
      getWorkspace: () => ({
        path: tmpDir,
      }),
    };
    const service = new DesktopFilesService(
      workspaceService as DesktopWorkspaceService,
      prisma as never,
    );
    const sourcePath = path.join(tmpDir, 'source.png');
    await fs.writeFile(sourcePath, Buffer.from(PNG_BYTES));

    const [firstImport] = await service.importAssets('ws-1', [sourcePath]);
    const [secondImport] = await service.importAssets('ws-1', [sourcePath]);

    expect(firstImport.localPath).toBeUndefined();
    expect(secondImport.localPath).toBeUndefined();
    expect(secondImport.displayName).toBe('source-1.png');
    const firstStoredPath = String(
      prisma.assets.get(firstImport.id)?.localPath,
    );
    const secondStoredPath = String(
      prisma.assets.get(secondImport.id)?.localPath,
    );
    expect(firstStoredPath).not.toBe(secondStoredPath);
    await expect(fs.readFile(firstStoredPath)).resolves.toEqual(
      Buffer.from(PNG_BYTES),
    );
    await expect(fs.readFile(secondStoredPath)).resolves.toEqual(
      Buffer.from(PNG_BYTES),
    );
  });

  it('reveals local assets by asset id instead of renderer-provided paths', async () => {
    const { DesktopFilesService } = await import('./files.service');
    const prisma = createPrismaMock();
    const workspaceService = {
      getWorkspace: () => ({
        path: tmpDir,
      }),
    };
    const service = new DesktopFilesService(
      workspaceService as DesktopWorkspaceService,
      prisma as never,
    );

    const asset = await service.writeGeneratedAsset({
      bytes: PNG_BYTES,
      jobId: 'job-2',
      mimeType: 'image/png',
      model: 'flux',
      provider: 'fal',
      workspaceId: 'ws-1',
    });

    await service.revealAsset(asset.id);

    expect(electronMockState.shell.revealedPaths).toEqual([
      prisma.assets.get(asset.id)?.localPath,
    ]);
  });

  it('rejects registered asset paths outside the workspace asset directory', async () => {
    const { DesktopFilesService } = await import('./files.service');
    const prisma = createPrismaMock();
    const workspaceService = {
      getWorkspace: () => ({ path: tmpDir }),
    };
    const service = new DesktopFilesService(
      workspaceService as DesktopWorkspaceService,
      prisma as never,
    );
    const outsidePath = path.join(tmpDir, 'outside.png');
    await fs.writeFile(outsidePath, Buffer.from(PNG_BYTES));
    prisma.assets.set('escaping-asset', {
      id: 'escaping-asset',
      localPath: outsidePath,
      mimeType: 'image/png',
      workspaceId: 'ws-1',
    });

    await expect(service.getAssetUrl('escaping-asset')).rejects.toThrow(
      'Path escapes workspace root',
    );
  });

  it('rejects an asset directory symlink that escapes the workspace', async () => {
    const { DesktopFilesService } = await import('./files.service');
    const prisma = createPrismaMock();
    const workspaceService = {
      getWorkspace: () => ({ path: tmpDir }),
    };
    const service = new DesktopFilesService(
      workspaceService as DesktopWorkspaceService,
      prisma as never,
    );
    const outsideDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'genfeed-files-outside-'),
    );
    const outsidePath = path.join(outsideDir, 'outside.png');
    await fs.writeFile(outsidePath, Buffer.from(PNG_BYTES));
    await fs.mkdir(path.join(tmpDir, '.genfeed'), { recursive: true });
    await fs.symlink(outsideDir, path.join(tmpDir, '.genfeed', 'assets'));
    prisma.assets.set('symlink-asset', {
      id: 'symlink-asset',
      localPath: path.join(tmpDir, '.genfeed', 'assets', 'outside.png'),
      mimeType: 'image/png',
      workspaceId: 'ws-1',
    });

    try {
      await expect(service.getAssetUrl('symlink-asset')).rejects.toThrow(
        'Path escapes workspace root',
      );
    } finally {
      await fs.rm(outsideDir, { force: true, recursive: true });
    }
  });

  it('rejects assets whose bytes disagree with the registered MIME type', async () => {
    const { DesktopFilesService } = await import('./files.service');
    const prisma = createPrismaMock();
    const workspaceService = {
      getWorkspace: () => ({ path: tmpDir }),
    };
    const service = new DesktopFilesService(
      workspaceService as DesktopWorkspaceService,
      prisma as never,
    );
    const asset = await service.writeGeneratedAsset({
      bytes: PNG_BYTES,
      jobId: 'mime-mismatch',
      mimeType: 'image/png',
      model: 'flux',
      provider: 'fal',
      workspaceId: 'ws-1',
    });
    const storedAsset = prisma.assets.get(asset.id);
    await fs.writeFile(String(storedAsset?.localPath), '<html>unsafe</html>');

    await expect(service.getAssetUrl(asset.id)).rejects.toThrow(
      'Local asset file type is invalid.',
    );
  });
});
