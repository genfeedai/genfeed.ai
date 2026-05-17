import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { DesktopWorkspaceService } from './workspace.service';

mock.module('electron', () => ({
  dialog: {
    showOpenDialog: async () => ({ filePaths: [] }),
  },
  shell: {
    showItemInFolder: async () => undefined,
  },
}));

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
});
