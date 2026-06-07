import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  electronMockState,
  resetElectronMockState,
} from './test-support/electron.mock';
import type { DesktopWorkspaceService } from './workspace.service';

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
      bytes: new Uint8Array([1, 2, 3]),
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
    expect(asset.localPath).toContain(
      path.join(
        '.genfeed',
        'assets',
        'replicate-black-forest-labs-flux-schnell-job-1.png',
      ),
    );
    await expect(fs.readFile(asset.localPath ?? '')).resolves.toEqual(
      Buffer.from([1, 2, 3]),
    );
    await expect(service.listAssets('ws-1')).resolves.toHaveLength(1);
    await expect(service.getAssetUrl(asset.id)).resolves.toContain(
      encodeURIComponent(asset.originalFileName),
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
    await fs.writeFile(sourcePath, Buffer.from([1, 2, 3]));

    const [firstImport] = await service.importAssets('ws-1', [sourcePath]);
    const [secondImport] = await service.importAssets('ws-1', [sourcePath]);

    expect(firstImport.localPath).not.toBe(secondImport.localPath);
    expect(secondImport.displayName).toBe('source-1.png');
    await expect(fs.readFile(firstImport.localPath ?? '')).resolves.toEqual(
      Buffer.from([1, 2, 3]),
    );
    await expect(fs.readFile(secondImport.localPath ?? '')).resolves.toEqual(
      Buffer.from([1, 2, 3]),
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
      bytes: new Uint8Array([4, 5, 6]),
      jobId: 'job-2',
      mimeType: 'image/png',
      model: 'flux',
      provider: 'fal',
      workspaceId: 'ws-1',
    });

    await service.revealAsset(asset.id);

    expect(electronMockState.shell.revealedPaths).toEqual([asset.localPath]);
  });
});
