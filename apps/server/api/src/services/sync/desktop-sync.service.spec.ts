import type { User } from '@clerk/backend';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetPublicMetadata } = vi.hoisted(() => ({
  mockGetPublicMetadata: vi.fn(),
}));

vi.mock('@api/helpers/decorators/log/log-method.decorator', () => ({
  LogMethod: () => () => undefined,
}));

vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: mockGetPublicMetadata,
}));

vi.mock('@api/services/files-microservice/client/files-client.service', () => ({
  FilesClientService: class FilesClientService {},
}));

vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

vi.mock('@genfeedai/config', () => ({
  IS_SELF_HOSTED: false,
}));

vi.mock('@genfeedai/enums', () => ({
  FileInputType: {
    BUFFER: 'buffer',
  },
}));

vi.mock('@genfeedai/prisma', () => ({
  AssetCategory: {
    REFERENCE: 'REFERENCE',
  },
  AssetParent: {
    BRAND: 'BRAND',
    ORGANIZATION: 'ORGANIZATION',
  },
}));

const { DesktopSyncService } = await import('./desktop-sync.service.ts');

const userId = '507f191e810c19729de860ee';
const organizationId = '607f191e810c19729de860ee';
const brandId = '707f191e810c19729de860ee';

const makeUser = (): User => ({ id: 'user_clerk' }) as unknown as User;

function buildService() {
  const prisma = {
    asset: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    desktopMessage: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    desktopThread: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  };
  const filesClientService = {
    getPresignedUploadUrl: vi.fn(),
    uploadToS3: vi.fn(),
  };

  return {
    filesClientService,
    prisma,
    service: new DesktopSyncService(
      filesClientService as never,
      prisma as never,
    ),
  };
}

describe('DesktopSyncService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPublicMetadata.mockReturnValue({
      brand: brandId,
      organization: organizationId,
      user: userId,
    });
  });

  it('pushes threads with canonical Genfeed user and organization ids', async () => {
    const { prisma, service } = buildService();
    prisma.desktopThread.findUnique.mockResolvedValue(null);
    prisma.desktopThread.upsert.mockResolvedValue({});

    const result = await service.pushThreads(makeUser(), {
      localUserId: 'desktop-local-user',
      threads: [
        {
          createdAt: '2026-05-01T10:00:00.000Z',
          id: 'thread-local',
          messages: [],
          status: 'idle',
          title: 'Offline plan',
          updatedAt: '2026-05-01T11:00:00.000Z',
          workspaceId: 'workspace-local',
        },
      ],
    });

    expect(result.data).toMatchObject({ accepted: 1, rejected: 0 });
    expect(prisma.desktopThread.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          localUserId: 'desktop-local-user',
          organizationId,
          userId,
        }),
        update: expect.objectContaining({
          localUserId: 'desktop-local-user',
          organizationId,
          userId,
        }),
      }),
    );
  });

  it('rejects thread pushes that collide with another owner', async () => {
    const { prisma, service } = buildService();
    prisma.desktopThread.findUnique.mockResolvedValue({
      organizationId,
      updatedAt: new Date('2026-05-01T09:00:00.000Z'),
      userId: 'other-user',
    });

    const result = await service.pushThreads(makeUser(), {
      localUserId: 'desktop-local-user',
      threads: [
        {
          createdAt: '2026-05-01T10:00:00.000Z',
          id: 'thread-local',
          messages: [],
          status: 'idle',
          title: 'Offline plan',
          updatedAt: '2026-05-01T11:00:00.000Z',
          workspaceId: 'workspace-local',
        },
      ],
    });

    expect(result.data).toMatchObject({ accepted: 0, rejected: 1 });
    expect(prisma.desktopThread.upsert).not.toHaveBeenCalled();
  });

  it('scopes pushed local assets to the selected brand and requests full upload', async () => {
    const { prisma, service } = buildService();
    const updatedAt = new Date('2026-05-01T11:00:00.000Z');

    prisma.asset.findFirst.mockResolvedValue(null);
    prisma.asset.create.mockResolvedValue({
      cloudObjectKey: `${organizationId}/hash/logo.png`,
      id: 'asset-cloud',
      residency: 'upload-pending',
      updatedAt,
      uploadPolicy: 'full',
    });

    const result = await service.pushAssets(makeUser(), {
      assets: [
        {
          displayName: 'logo.png',
          id: 'asset-local',
          kind: 'image',
          mimeType: 'image/png',
          origin: 'local-import',
          originalFileName: 'logo.png',
          residency: 'local-only',
          sha256: 'hash',
          sizeBytes: 128,
          uploadPolicy: 'full',
        },
      ],
    });

    expect(result.data.assets[0]).toMatchObject({
      cloudAssetId: 'asset-cloud',
      localAssetId: 'asset-local',
      needsUpload: true,
      status: 'accepted',
    });
    expect(prisma.asset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          localAssetId: 'asset-local',
          parentBrandId: brandId,
          parentOrgId: organizationId,
          parentType: 'BRAND',
          userId,
        }),
      }),
    );
  });
});
