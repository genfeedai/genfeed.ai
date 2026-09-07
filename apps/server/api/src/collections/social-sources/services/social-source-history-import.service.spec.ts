vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import {
  SOCIAL_HISTORY_IMPORT_LIMIT,
  SOCIAL_HISTORY_IMPORT_WINDOW_DAYS,
  SocialSourceHistoryImportService,
} from '@api/collections/social-sources/services/social-source-history-import.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivityKey,
  SocialSourceHistoryImportStatus,
  SocialSourceType,
} from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';

describe('SocialSourceHistoryImportService', () => {
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
  const activitiesService = { create: vi.fn() };
  const queue = { queueSystemWorkflow: vi.fn() };
  const credential = { findFirst: vi.fn() };
  const brand = { findFirst: vi.fn() };
  const socialSource = {
    create: vi.fn(),
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  };
  const prisma = {
    brand,
    credential,
    socialSource,
  } as unknown as PrismaService;

  const connectedCredential = {
    brandId: 'brand-1',
    externalAvatar: 'https://cdn/avatar.png',
    externalHandle: '@BrandHandle',
    externalId: 'ig-123',
    externalName: 'Brand',
    id: 'cred-1',
    organizationId: 'org-1',
    platform: 'INSTAGRAM',
    userId: 'user-1',
    username: null,
  };

  let service: SocialSourceHistoryImportService;

  beforeEach(() => {
    vi.clearAllMocks();
    credential.findFirst.mockResolvedValue(connectedCredential);
    brand.findFirst.mockResolvedValue({
      id: 'brand-1',
      isSocialHistoryImportEnabled: true,
    });
    socialSource.findFirst.mockResolvedValue(null);
    socialSource.create.mockImplementation(async ({ data }) => ({
      id: 'source-1',
      ...data,
    }));
    activitiesService.create.mockResolvedValue({});
    queue.queueSystemWorkflow.mockResolvedValue('job-1');
    service = new SocialSourceHistoryImportService(
      prisma,
      activitiesService as never,
      queue as never,
      logger,
    );
  });

  it('creates an own-account source and queues the import after connect', async () => {
    const result = await service.scheduleForCredential({
      credentialId: 'cred-1',
      organizationId: 'org-1',
    });

    expect(result).toEqual({ sourceId: 'source-1', status: 'scheduled' });
    expect(socialSource.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        brandId: 'brand-1',
        credentialId: 'cred-1',
        handle: 'brandhandle',
        metadata: {
          historyImport: expect.objectContaining({
            credentialId: 'cred-1',
            status: SocialSourceHistoryImportStatus.SCHEDULED,
            windowDays: SOCIAL_HISTORY_IMPORT_WINDOW_DAYS,
          }),
        },
        organizationId: 'org-1',
        platform: 'instagram',
        sourceType: SocialSourceType.OWN_ACCOUNT,
        userId: 'user-1',
      }),
    });
    expect(queue.queueSystemWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: 'social-source.history-import',
        inputValues: {
          request: expect.objectContaining({
            limit: SOCIAL_HISTORY_IMPORT_LIMIT,
            sourceId: 'source-1',
            windowDays: SOCIAL_HISTORY_IMPORT_WINDOW_DAYS,
          }),
        },
        organizationId: 'org-1',
        userId: 'user-1',
      }),
      'social-source-history-import-source-1',
      expect.objectContaining({ replaceTerminalJob: true }),
    );
    expect(activitiesService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        key: ActivityKey.SOCIAL_HISTORY_IMPORT_SCHEDULED,
        organizationId: 'org-1',
      }),
    );
  });

  it('skips and audits when the brand opted out of history import', async () => {
    brand.findFirst.mockResolvedValue({
      id: 'brand-1',
      isSocialHistoryImportEnabled: false,
    });

    const result = await service.scheduleForCredential({
      credentialId: 'cred-1',
      organizationId: 'org-1',
    });

    expect(result).toEqual({
      skipReason: 'brand_opted_out',
      status: 'skipped',
    });
    expect(socialSource.create).not.toHaveBeenCalled();
    expect(queue.queueSystemWorkflow).not.toHaveBeenCalled();
    expect(activitiesService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        key: ActivityKey.SOCIAL_HISTORY_IMPORT_SKIPPED,
      }),
    );
  });

  it('skips platforms without a source collector', async () => {
    credential.findFirst.mockResolvedValue({
      ...connectedCredential,
      platform: 'FACEBOOK',
    });

    const result = await service.scheduleForCredential({
      credentialId: 'cred-1',
      organizationId: 'org-1',
    });

    expect(result).toEqual({
      skipReason: 'unsupported_platform',
      status: 'skipped',
    });
    expect(queue.queueSystemWorkflow).not.toHaveBeenCalled();
  });

  it('revives a tombstoned own-account source instead of duplicating it', async () => {
    const tombstone = {
      avatarUrl: null,
      brandId: 'brand-1',
      credentialId: 'cred-1',
      displayName: null,
      externalId: null,
      handle: 'brandhandle',
      id: 'source-9',
      isDeleted: true,
      metadata: { keep: true },
      organizationId: 'org-1',
    };
    socialSource.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(tombstone)
      .mockResolvedValueOnce({ ...tombstone, isDeleted: false });

    const result = await service.scheduleForCredential({
      credentialId: 'cred-1',
      organizationId: 'org-1',
    });

    expect(result).toEqual({ sourceId: 'source-9', status: 'scheduled' });
    expect(socialSource.create).not.toHaveBeenCalled();
    expect(socialSource.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        isActive: true,
        isDeleted: false,
        metadata: expect.objectContaining({
          historyImport: expect.objectContaining({
            status: SocialSourceHistoryImportStatus.SCHEDULED,
          }),
          keep: true,
        }),
      }),
      where: expect.objectContaining({
        id: 'source-9',
        isDeleted: true,
        organizationId: 'org-1',
      }),
    });
  });

  it('records completion counts on the source and as an activity', async () => {
    socialSource.updateMany.mockResolvedValue({ count: 1 });
    const source = {
      brandId: 'brand-1',
      credentialId: 'cred-1',
      handle: 'brandhandle',
      id: 'source-1',
      metadata: {
        historyImport: {
          credentialId: 'cred-1',
          requestedAt: '2026-09-06T00:00:00.000Z',
          status: SocialSourceHistoryImportStatus.RUNNING,
          windowDays: 90,
        },
      },
      organizationId: 'org-1',
      platform: 'instagram',
      userId: 'user-1',
    };

    await service.markCompleted(source as never, {
      importedCount: 42,
      provider: 'brand-oauth',
      rejectedCount: 1,
    });

    expect(socialSource.updateMany).toHaveBeenCalledWith({
      data: {
        metadata: {
          historyImport: expect.objectContaining({
            importedCount: 42,
            provider: 'brand-oauth',
            rejectedCount: 1,
            status: SocialSourceHistoryImportStatus.COMPLETED,
          }),
        },
      },
      where: expect.objectContaining({
        id: 'source-1',
        isDeleted: false,
        organizationId: 'org-1',
      }),
    });
    expect(activitiesService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        key: ActivityKey.SOCIAL_HISTORY_IMPORT_COMPLETED,
        value: expect.stringContaining('"importedCount":42'),
      }),
    );
  });
});
