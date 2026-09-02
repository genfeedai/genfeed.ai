import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { testId } from '@helpers/testing/test-id.helper';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/decorators/log/log-method.decorator', () => ({
  LogMethod: () => () => undefined,
}));

vi.mock('@api/services/files-microservice/client/files-client.service', () => ({
  FilesClientService: class FilesClientService {},
}));

vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

vi.mock('@genfeedai/config', () => ({
  isSelfHostedDeployment: () => false,
}));

vi.mock('@genfeedai/enums', () => ({
  FileInputType: {
    BUFFER: 'buffer',
  },
}));

// Real, complete AssetCategory/AssetParent enums (this file previously
// hand-rolled a partial subset) via the light @genfeedai/prisma/testing
// subpath — no heavy PrismaClient/runtime import required.
vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

const { DesktopSyncService } = await import('./desktop-sync.service');
const { decodeManifestCursor, decodeThreadCursor, encodeThreadCursor } =
  await import('./desktop-sync-cursor.util');

const userId = testId('user');
const organizationId = testId('org');
const brandId = testId('brand');

const makeUser = (): User =>
  ({
    brandId,
    id: 'user_authProvider',
    isSuperAdmin: false,
    organizationId,
    userId,
  }) as unknown as User;

function buildService() {
  const prisma = {
    asset: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { sizeBytes: 0 } }),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    brand: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    desktopMessage: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    desktopThread: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    ingredient: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    organization: {
      findFirst: vi.fn().mockResolvedValue(null),
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
  });

  it('pushes threads with canonical Genfeed user and organization ids', async () => {
    const { prisma, service } = buildService();

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
        {
          createdAt: '2026-05-02T10:00:00.000Z',
          id: 'thread-second',
          messages: [],
          status: 'idle',
          title: 'Second offline plan',
          updatedAt: '2026-05-02T11:00:00.000Z',
          workspaceId: 'workspace-local',
        },
      ],
    });

    expect(result.data).toMatchObject({ accepted: 2, rejected: 0 });
    expect(prisma.desktopThread.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.desktopThread.create).toHaveBeenCalledTimes(2);
    expect(prisma.desktopThread.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'thread-local',
        localUserId: 'desktop-local-user',
        organizationId,
        userId,
      }),
    });
  });

  it('pulls threads with bounded child message queries', async () => {
    const { prisma, service } = buildService();
    const threadUpdatedAt = new Date('2026-05-01T11:00:00.000Z');
    const messageCreatedAt = new Date('2026-05-01T10:30:00.000Z');
    prisma.desktopThread.findMany.mockResolvedValue([
      {
        createdAt: new Date('2026-05-01T10:00:00.000Z'),
        id: 'thread-local',
        status: 'idle',
        title: 'Offline plan',
        updatedAt: threadUpdatedAt,
        workspaceId: 'workspace-local',
      },
    ]);
    prisma.desktopMessage.findMany.mockResolvedValue([
      {
        content: 'hello',
        createdAt: messageCreatedAt,
        draftId: null,
        generatedContent: null,
        id: 'message-local',
        role: 'user',
      },
    ]);

    const result = await service.pullThreads(
      makeUser(),
      '2026-05-01T09:00:00.000Z',
      { limit: 999, messageLimit: 999 },
    );

    expect(prisma.desktopThread.findMany).toHaveBeenCalledWith({
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      select: {
        createdAt: true,
        id: true,
        status: true,
        title: true,
        updatedAt: true,
        workspaceId: true,
      },
      take: 101,
      where: {
        organizationId,
        updatedAt: { gt: new Date('2026-05-01T09:00:00.000Z') },
        userId,
      },
    });
    expect(prisma.desktopMessage.findMany).toHaveBeenCalledWith({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        content: true,
        createdAt: true,
        draftId: true,
        generatedContent: true,
        id: true,
        role: true,
      },
      take: 200,
      where: { threadId: 'thread-local' },
    });
    expect(result.data).toMatchObject({
      hasMore: false,
      limits: {
        messageLimit: 200,
        threadLimit: 100,
      },
      threads: [
        {
          id: 'thread-local',
          messages: [{ id: 'message-local' }],
        },
      ],
    });
  });

  it('preserves version ordering for duplicate thread ids in one push', async () => {
    const { prisma, service } = buildService();
    const thread = {
      createdAt: '2026-05-01T10:00:00.000Z',
      id: 'thread-local',
      messages: [],
      status: 'idle',
      title: 'Offline plan',
      updatedAt: '2026-05-01T11:00:00.000Z',
      workspaceId: 'workspace-local',
    };
    prisma.desktopThread.create
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce({ code: 'P2002' });

    const result = await service.pushThreads(makeUser(), {
      localUserId: 'desktop-local-user',
      threads: [thread, thread],
    });

    expect(result.data).toMatchObject({ accepted: 1, rejected: 1 });
    expect(prisma.desktopThread.create).toHaveBeenCalledTimes(2);
    expect(prisma.desktopThread.updateMany).toHaveBeenCalledTimes(3);
  });

  it('retries the conditional update when a concurrent push wins the create race', async () => {
    const { prisma, service } = buildService();
    prisma.desktopThread.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    prisma.desktopThread.create.mockRejectedValueOnce({ code: 'P2002' });

    const result = await service.pushThreads(makeUser(), {
      localUserId: 'desktop-local-user',
      threads: [
        {
          createdAt: '2026-05-01T10:00:00.000Z',
          id: 'thread-local',
          messages: [],
          status: 'idle',
          title: 'Newest offline plan',
          updatedAt: '2026-05-01T12:00:00.000Z',
          workspaceId: 'workspace-local',
        },
      ],
    });

    expect(result.data).toMatchObject({ accepted: 1, rejected: 0 });
    expect(prisma.desktopThread.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.desktopThread.updateMany).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        organizationId,
        title: 'Newest offline plan',
        updatedAt: new Date('2026-05-01T12:00:00.000Z'),
        userId,
      }),
      where: {
        id: 'thread-local',
        organizationId,
        updatedAt: { lt: new Date('2026-05-01T12:00:00.000Z') },
        userId,
      },
    });
  });

  it('rejects thread pushes that collide with another owner', async () => {
    const { prisma, service } = buildService();
    prisma.desktopThread.create.mockRejectedValueOnce({ code: 'P2002' });

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
    expect(prisma.desktopThread.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.desktopThread.updateMany).toHaveBeenCalledWith({
      data: expect.any(Object),
      where: {
        id: 'thread-local',
        organizationId,
        updatedAt: { lt: new Date('2026-05-01T11:00:00.000Z') },
        userId,
      },
    });
  });

  it('rejects a thread when its create fails for a non-conflict reason', async () => {
    const { prisma, service } = buildService();
    prisma.desktopThread.create.mockRejectedValue(new Error('db timeout'));

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
    expect(prisma.desktopThread.updateMany).toHaveBeenCalledTimes(1);
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
          createdAt: '2026-05-01T10:00:00.000Z',
          displayName: 'logo.png',
          id: 'asset-local',
          kind: 'image',
          mimeType: 'image/png',
          organizationId,
          origin: 'local-import',
          originalFileName: 'logo.png',
          residency: 'local-only',
          sha256: 'hash',
          sizeBytes: 128,
          updatedAt: '2026-05-01T11:00:00.000Z',
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

  it('rejects full desktop asset sync when organization storage quota would be exceeded', async () => {
    const { prisma, service } = buildService();
    prisma.asset.aggregate.mockResolvedValue({
      _sum: { sizeBytes: 10 * 1024 * 1024 * 1024 - 64 },
    });
    prisma.asset.findFirst.mockResolvedValue(null);

    const result = await service.pushAssets(makeUser(), {
      assets: [
        {
          createdAt: '2026-05-01T10:00:00.000Z',
          displayName: 'large.png',
          id: 'asset-local',
          kind: 'image',
          mimeType: 'image/png',
          organizationId,
          origin: 'local-import',
          originalFileName: 'large.png',
          residency: 'local-only',
          sha256: 'hash',
          sizeBytes: 128,
          updatedAt: '2026-05-01T11:00:00.000Z',
          uploadPolicy: 'full',
        },
      ],
    });

    expect(result.data.assets[0]).toMatchObject({
      localAssetId: 'asset-local',
      reason: 'storage-quota-exceeded',
      status: 'rejected',
    });
    expect(prisma.asset.create).not.toHaveBeenCalled();
  });

  it('rejects disallowed desktop upload MIME types with 415', async () => {
    const { prisma, service } = buildService();
    prisma.asset.findFirst.mockResolvedValue({
      id: 'asset-cloud',
      localAssetId: 'asset-local',
      mimeType: 'application/x-msdownload',
      sizeBytes: 128,
    });

    await expect(
      service.requestAssetUpload(makeUser(), {
        assetId: 'asset-local',
        mimeType: 'application/x-msdownload',
      }),
    ).rejects.toMatchObject({ status: 415 });
  });

  it('rejects a push against a soft-deleted cloud asset and surfaces isDeleted + updatedAt', async () => {
    const { prisma, service } = buildService();
    // Soft-delete is boolean-only (isDeleted). The tombstone instant is
    // updatedAt — set when the cloud Asset row was deleted. Wire both so a
    // future refactor cannot silently drop the flag or repoint the instant.
    const deletedInstant = new Date('2026-05-01T12:00:00.000Z');
    prisma.asset.findFirst.mockResolvedValue({
      cloudObjectKey: `${organizationId}/hash/logo.png`,
      id: 'asset-cloud',
      isDeleted: true,
      residency: 'synced',
      updatedAt: deletedInstant,
      uploadPolicy: 'full',
    });

    const result = await service.pushAssets(makeUser(), {
      assets: [
        {
          createdAt: '2026-05-01T10:00:00.000Z',
          displayName: 'logo.png',
          id: 'asset-local',
          kind: 'image',
          mimeType: 'image/png',
          organizationId,
          origin: 'local-import',
          originalFileName: 'logo.png',
          residency: 'local-only',
          sha256: 'hash',
          sizeBytes: 128,
          updatedAt: '2026-05-01T11:00:00.000Z',
          uploadPolicy: 'full',
        },
      ],
    });

    expect(result.data).toMatchObject({ accepted: 0, rejected: 1 });
    expect(result.data.assets[0]).toMatchObject({
      cloudAssetId: 'asset-cloud',
      isDeleted: true,
      localAssetId: 'asset-local',
      reason: 'cloud-deleted',
      residency: 'synced',
      status: 'rejected',
      updatedAt: deletedInstant,
    });
    // Soft-deleted match short-circuits before any write.
    expect(prisma.asset.create).not.toHaveBeenCalled();
    expect(prisma.asset.update).not.toHaveBeenCalled();
  });

  it('pull threads: composite cursor tie-breaks equal updatedAt rows across the page boundary', async () => {
    const { prisma, service } = buildService();
    const tiedAt = new Date('2026-05-01T11:00:00.000Z');
    const makeThread = (id: string) => ({
      createdAt: new Date('2026-05-01T10:00:00.000Z'),
      id,
      status: 'idle',
      title: 'Offline plan',
      updatedAt: tiedAt,
      workspaceId: 'workspace-local',
    });
    prisma.desktopThread.findMany.mockResolvedValue([
      makeThread('thread-1'),
      makeThread('thread-2'),
      makeThread('thread-3'),
    ]);

    const result = await service.pullThreads(makeUser(), undefined, {
      limit: 2,
    });

    expect(result.data.hasMore).toBe(true);
    expect(result.data.threads.map((t: { id: string }) => t.id)).toEqual([
      'thread-1',
      'thread-2',
    ]);
    // The cursor is the last RETURNED row — not the over-fetched probe row
    // and never "now" — so the tied thread-3 satisfies the next request.
    expect(decodeThreadCursor(result.data.updatedCursor ?? undefined)).toEqual({
      id: 'thread-2',
      updatedAt: tiedAt.toISOString(),
    });

    prisma.desktopThread.findMany.mockResolvedValue([]);
    await service.pullThreads(makeUser(), result.data.updatedCursor as string, {
      limit: 2,
    });

    expect(prisma.desktopThread.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          organizationId,
          userId,
          OR: [
            { updatedAt: { gt: tiedAt } },
            { id: { gt: 'thread-2' }, updatedAt: tiedAt },
          ],
        },
      }),
    );
  });

  it('pull threads: an empty page keeps the incoming cursor instead of advancing to now', async () => {
    const { prisma, service } = buildService();
    prisma.desktopThread.findMany.mockResolvedValue([]);
    const cursor = encodeThreadCursor({
      id: 'thread-9',
      updatedAt: '2026-05-01T09:00:00.000Z',
    });

    const result = await service.pullThreads(makeUser(), cursor);

    expect(result.data.hasMore).toBe(false);
    expect(result.data.updatedCursor).toBe(cursor);
  });

  describe('getBrandManifest', () => {
    type SyntheticAssetRow = {
      id: string;
      isDeleted: boolean;
      parentBrandId: string;
      parentOrgId: string;
      updatedAt: Date;
    };

    type AssetQueryArgs = {
      take: number;
      where: {
        OR?: [
          { updatedAt: { gt: Date } },
          { id: { gt: string }; updatedAt: Date },
        ];
        isDeleted?: boolean;
        parentBrandId?: string;
        parentOrgId?: string;
        updatedAt?: { gt: Date };
      };
    };

    const makeAssetRow = (
      id: string,
      updatedAt: Date,
      isDeleted = false,
    ): SyntheticAssetRow => ({
      id,
      isDeleted,
      parentBrandId: brandId,
      parentOrgId: organizationId,
      updatedAt,
    });

    // Minimal in-memory interpreter for the exact query shape the service
    // builds, so the drain test exercises real keyset semantics.
    const runAssetQuery = (
      rows: SyntheticAssetRow[],
      args: AssetQueryArgs,
    ): SyntheticAssetRow[] => {
      const { where } = args;
      const matched = rows.filter((row) => {
        if (
          where.parentOrgId !== undefined &&
          row.parentOrgId !== where.parentOrgId
        ) {
          return false;
        }
        if (
          where.parentBrandId !== undefined &&
          row.parentBrandId !== where.parentBrandId
        ) {
          return false;
        }
        if (
          where.isDeleted !== undefined &&
          row.isDeleted !== where.isDeleted
        ) {
          return false;
        }
        if (
          where.updatedAt?.gt !== undefined &&
          row.updatedAt.getTime() <= where.updatedAt.gt.getTime()
        ) {
          return false;
        }
        if (where.OR) {
          const [beyond, tie] = where.OR;
          const isBeyond =
            row.updatedAt.getTime() > beyond.updatedAt.gt.getTime();
          const isTieBreak =
            row.updatedAt.getTime() === tie.updatedAt.getTime() &&
            row.id > tie.id.gt;
          if (!isBeyond && !isTieBreak) {
            return false;
          }
        }
        return true;
      });
      matched.sort(
        (a, b) =>
          a.updatedAt.getTime() - b.updatedAt.getTime() ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
      // Copies, so mid-drain dataset mutations cannot retroactively rewrite
      // rows already delivered to the client.
      return matched.slice(0, args.take).map((row) => ({ ...row }));
    };

    it('first pull excludes tombstones, orders ascending, and advances to the last returned row', async () => {
      const { prisma, service } = buildService();
      const rows = [
        makeAssetRow('asset-0001', new Date('2026-05-01T09:00:00.000Z')),
        makeAssetRow('asset-0002', new Date('2026-05-01T10:00:00.000Z')),
      ];
      prisma.asset.findMany.mockResolvedValue(rows);

      const result = await service.getBrandManifest(makeUser(), {});

      expect(prisma.asset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
          take: 501,
          where: {
            isDeleted: false,
            parentBrandId: brandId,
            parentOrgId: organizationId,
          },
        }),
      );
      expect(result.data.hasMore).toBe(false);
      expect(decodeManifestCursor(result.data.updatedCursor)).toEqual({
        assets: { id: 'asset-0002', updatedAt: '2026-05-01T10:00:00.000Z' },
      });
    });

    it('tie on updatedAt at the page boundary advances by id, not past the tied rows', async () => {
      const { prisma, service } = buildService();
      const tiedAt = new Date('2026-05-01T09:00:00.000Z');
      prisma.asset.findMany.mockResolvedValue(
        Array.from({ length: 501 }, (_, i) =>
          makeAssetRow(`asset-${String(i).padStart(4, '0')}`, tiedAt),
        ),
      );

      const result = await service.getBrandManifest(makeUser(), {});

      expect(result.data.hasMore).toBe(true);
      expect(result.data.assets).toHaveLength(500);
      expect(decodeManifestCursor(result.data.updatedCursor).assets).toEqual({
        id: 'asset-0499',
        updatedAt: tiedAt.toISOString(),
      });

      prisma.asset.findMany.mockResolvedValue([]);
      await service.getBrandManifest(makeUser(), {
        cursor: result.data.updatedCursor,
      });

      expect(prisma.asset.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: {
            parentBrandId: brandId,
            parentOrgId: organizationId,
            OR: [
              { updatedAt: { gt: tiedAt } },
              { id: { gt: 'asset-0499' }, updatedAt: tiedAt },
            ],
          },
        }),
      );
    });

    it('accepts a legacy plain-ISO cursor and includes tombstones on incremental pulls', async () => {
      const { prisma, service } = buildService();
      prisma.asset.findMany.mockResolvedValue([]);
      const legacy = '2026-05-01T09:00:00.000Z';

      const result = await service.getBrandManifest(makeUser(), {
        cursor: legacy,
      });

      expect(prisma.asset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            parentBrandId: brandId,
            parentOrgId: organizationId,
            updatedAt: { gt: new Date(legacy) },
          },
        }),
      );
      // An empty page keeps the position instead of advancing to now.
      expect(decodeManifestCursor(result.data.updatedCursor)).toEqual({
        assets: { updatedAt: legacy },
        brands: { updatedAt: legacy },
        ingredients: { updatedAt: legacy },
      });
    });

    it('drains 1000 changed rows losslessly across pages, re-delivering rows updated or deleted mid-drain', async () => {
      const { prisma, service } = buildService();
      const base = new Date('2026-05-01T00:00:00.000Z').getTime();
      const minute = 60_000;
      // 300 distinct timestamps, a 400-row tie cluster spanning the page
      // boundary, then 300 distinct timestamps.
      const dataset = Array.from({ length: 1000 }, (_, i) => {
        const tickIndex = i < 300 ? i : i < 700 ? 300 : i;
        return makeAssetRow(
          `asset-${String(i).padStart(4, '0')}`,
          new Date(base + tickIndex * minute),
        );
      });
      const maxTime = base + 999 * minute;
      prisma.asset.findMany.mockImplementation((args: AssetQueryArgs) =>
        Promise.resolve(runAssetQuery(dataset, args)),
      );

      const deliveries: SyntheticAssetRow[] = [];
      const firstPage = await service.getBrandManifest(makeUser(), {});
      deliveries.push(...(firstPage.data.assets as SyntheticAssetRow[]));
      expect(firstPage.data.hasMore).toBe(true);

      // Between pages: one already-delivered row is updated and another is
      // soft-deleted. Both must be re-delivered by later pages.
      const updatedRow = dataset.find((row) => row.id === 'asset-0100');
      const deletedRow = dataset.find((row) => row.id === 'asset-0200');
      if (!updatedRow || !deletedRow) {
        throw new Error('synthetic rows missing');
      }
      updatedRow.updatedAt = new Date(maxTime + 60 * minute);
      deletedRow.isDeleted = true;
      deletedRow.updatedAt = new Date(maxTime + 120 * minute);

      let cursor = firstPage.data.updatedCursor;
      let hasMore = firstPage.data.hasMore;
      let pageGuard = 0;
      while (hasMore) {
        pageGuard++;
        expect(pageGuard).toBeLessThan(20);
        const page = await service.getBrandManifest(makeUser(), { cursor });
        deliveries.push(...(page.data.assets as SyntheticAssetRow[]));
        cursor = page.data.updatedCursor;
        hasMore = page.data.hasMore;
      }

      const deliveryCounts = new Map<string, number>();
      for (const row of deliveries) {
        deliveryCounts.set(row.id, (deliveryCounts.get(row.id) ?? 0) + 1);
      }
      // Every one of the 1000 rows arrived — nothing skipped past the cap or
      // lost on updatedAt ties.
      expect(deliveryCounts.size).toBe(1000);
      expect(deliveries).toHaveLength(1002);
      expect(deliveryCounts.get('asset-0100')).toBe(2);
      expect(deliveryCounts.get('asset-0200')).toBe(2);
      const tombstoneDeliveries = deliveries.filter(
        (row) => row.id === 'asset-0200',
      );
      expect(tombstoneDeliveries.at(0)?.isDeleted).toBe(false);
      expect(tombstoneDeliveries.at(-1)?.isDeleted).toBe(true);
    });
  });
});
