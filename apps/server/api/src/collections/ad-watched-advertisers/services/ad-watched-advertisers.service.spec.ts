vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { AdWatchedAdvertisersService } from '@api/collections/ad-watched-advertisers/services/ad-watched-advertisers.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { PaidCreativePlatform } from '@genfeedai/integrations/ads';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';

type MockDelegate = {
  create: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
};

describe('AdWatchedAdvertisersService persistence boundary', () => {
  let delegate: MockDelegate;
  let service: AdWatchedAdvertisersService;

  beforeEach(() => {
    delegate = {
      create: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          ...data,
          createdAt: new Date(),
          id: 'advertiser-new',
          isDeleted: false,
          updatedAt: new Date(),
        }),
      ),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockImplementation(({ data, where }) =>
        Promise.resolve({
          advertiserHandle: 'nike',
          brandId: where.brandId ?? null,
          id: where.id,
          isDeleted: data.isDeleted,
          organizationId: where.organizationId,
        }),
      ),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    };

    service = new AdWatchedAdvertisersService(
      {
        brand: { findFirst: vi.fn().mockResolvedValue({ id: 'brand-1' }) },
        credential: {
          findFirst: vi.fn().mockResolvedValue({
            brandId: 'brand-1',
            id: 'credential-1',
            platform: 'FACEBOOK',
          }),
        },
        adWatchedAdvertiser: delegate,
      } as unknown as PrismaService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('writes only defined scalar fields when the handle is not already watched', async () => {
      await service.create({
        advertiserHandle: 'nike',
        organizationId: 'org-1',
        platform: 'meta',
      });

      expect(delegate.findFirst).toHaveBeenCalledWith({
        where: {
          advertiserHandle: 'nike',
          brandId: null,
          organizationId: 'org-1',
          platform: 'meta',
        },
      });
      expect(delegate.create).toHaveBeenCalledWith({
        data: {
          advertiserHandle: 'nike',
          organizationId: 'org-1',
          platform: 'meta',
        },
      });
      expect(delegate.updateMany).not.toHaveBeenCalled();
    });

    it('patches the existing row instead of erroring when the handle is already active', async () => {
      delegate.findFirst.mockResolvedValue({
        advertiserHandle: 'nike',
        brandId: 'brand-1',
        id: 'advertiser-1',
        isDeleted: false,
        organizationId: 'org-1',
      });

      await service.create({
        advertiserHandle: 'nike',
        advertiserName: 'Nike Inc',
        brandId: 'brand-1',
        organizationId: 'org-1',
        platform: 'meta',
      });

      expect(delegate.updateMany).toHaveBeenCalledWith({
        data: { advertiserName: 'Nike Inc', isDeleted: false },
        where: {
          brandId: 'brand-1',
          id: 'advertiser-1',
          organizationId: 'org-1',
        },
      });
      expect(delegate.create).not.toHaveBeenCalled();
    });

    it('creates a separate row when another brand already watches the same handle', async () => {
      delegate.findFirst.mockImplementation(({ where }) =>
        Promise.resolve(
          where.brandId === 'brand-1'
            ? {
                advertiserHandle: 'nike',
                brandId: 'brand-1',
                id: 'advertiser-brand-1',
                isDeleted: false,
                organizationId: 'org-1',
              }
            : null,
        ),
      );

      await service.create({
        advertiserHandle: 'nike',
        brandId: 'brand-2',
        organizationId: 'org-1',
        platform: 'meta',
      });

      expect(delegate.findFirst).toHaveBeenCalledWith({
        where: {
          advertiserHandle: 'nike',
          brandId: 'brand-2',
          organizationId: 'org-1',
          platform: 'meta',
        },
      });
      expect(delegate.create).toHaveBeenCalledWith({
        data: {
          advertiserHandle: 'nike',
          brandId: 'brand-2',
          organizationId: 'org-1',
          platform: 'meta',
        },
      });
      expect(delegate.updateMany).not.toHaveBeenCalled();
    });

    it('revives a soft-deleted advertiser on re-add rather than violating the handle unique index', async () => {
      delegate.findFirst
        .mockResolvedValueOnce({
          advertiserHandle: 'pepsi',
          brandId: null,
          id: 'advertiser-2',
          isDeleted: true,
          organizationId: 'org-1',
        })
        .mockResolvedValueOnce({
          advertiserHandle: 'pepsi',
          brandId: null,
          id: 'advertiser-2',
          isDeleted: false,
          organizationId: 'org-1',
        });

      const result = await service.create({
        advertiserHandle: 'pepsi',
        organizationId: 'org-1',
        platform: 'meta',
      });

      expect(delegate.updateMany).toHaveBeenCalledWith({
        data: { isDeleted: false },
        where: { brandId: null, id: 'advertiser-2', organizationId: 'org-1' },
      });
      expect(delegate.create).not.toHaveBeenCalled();
      expect(result.isDeleted).toBe(false);
    });

    it('watches the same handle on two platforms as two rows (#3537)', async () => {
      delegate.findFirst.mockImplementation(({ where }) =>
        Promise.resolve(
          where.platform === 'meta'
            ? {
                advertiserHandle: 'nike',
                brandId: null,
                id: 'advertiser-meta',
                isDeleted: false,
                organizationId: 'org-1',
                platform: 'meta',
              }
            : null,
        ),
      );

      await service.create({
        advertiserHandle: 'nike',
        organizationId: 'org-1',
        platform: 'tiktok',
      });

      expect(delegate.create).toHaveBeenCalledWith({
        data: {
          advertiserHandle: 'nike',
          organizationId: 'org-1',
          platform: 'tiktok',
        },
      });
      expect(delegate.updateMany).not.toHaveBeenCalled();
    });

    it('canonicalizes the handle per platform and rejects one the platform cannot address', async () => {
      await service.create({
        advertiserHandle: '  @Nike_Running ',
        organizationId: 'org-1',
        platform: 'x',
      });

      expect(delegate.create).toHaveBeenCalledWith({
        data: {
          advertiserHandle: 'nike_running',
          organizationId: 'org-1',
          platform: 'x',
        },
      });

      await expect(
        service.create({
          advertiserHandle: 'nike-running',
          organizationId: 'org-1',
          platform: 'x',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a platform outside the paid-creative pool instead of defaulting to one', async () => {
      await expect(
        service.create({
          advertiserHandle: 'nike',
          organizationId: 'org-1',
          platform: 'linkedin' as PaidCreativePlatform,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(delegate.create).not.toHaveBeenCalled();
    });

    it('requires an organization context before any lookup or write', async () => {
      await expect(
        service.create({
          advertiserHandle: 'nike',
          organizationId: '   ',
          platform: 'meta',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(delegate.findFirst).not.toHaveBeenCalled();
      expect(delegate.create).not.toHaveBeenCalled();
    });

    it('requires a pinned credential to belong to the watched platform (#3537)', async () => {
      const credentialFindFirst = vi.fn().mockResolvedValue(null);
      service = new AdWatchedAdvertisersService(
        {
          adWatchedAdvertiser: delegate,
          brand: { findFirst: vi.fn().mockResolvedValue({ id: 'brand-1' }) },
          credential: { findFirst: credentialFindFirst },
        } as unknown as PrismaService,
        {
          debug: vi.fn(),
          error: vi.fn(),
          log: vi.fn(),
          warn: vi.fn(),
        } as unknown as LoggerService,
      );

      await expect(
        service.create({
          advertiserHandle: 'nike',
          credentialId: 'credential-1',
          organizationId: 'org-1',
          platform: 'tiktok',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(credentialFindFirst).toHaveBeenCalledWith({
        where: {
          id: 'credential-1',
          isDeleted: false,
          organizationId: 'org-1',
          platform: 'TIKTOK',
        },
      });
      expect(delegate.create).not.toHaveBeenCalled();
    });

    it('resolves YouTube watches against the Google Ads credential (#3537)', async () => {
      const credentialFindFirst = vi
        .fn()
        .mockResolvedValue({ brandId: null, id: 'credential-1' });
      service = new AdWatchedAdvertisersService(
        {
          adWatchedAdvertiser: delegate,
          brand: { findFirst: vi.fn().mockResolvedValue({ id: 'brand-1' }) },
          credential: { findFirst: credentialFindFirst },
        } as unknown as PrismaService,
        {
          debug: vi.fn(),
          error: vi.fn(),
          log: vi.fn(),
          warn: vi.fn(),
        } as unknown as LoggerService,
      );

      await service.create({
        advertiserHandle: 'nike',
        credentialId: 'credential-1',
        organizationId: 'org-1',
        platform: 'youtube',
      });

      expect(credentialFindFirst).toHaveBeenCalledWith({
        where: {
          id: 'credential-1',
          isDeleted: false,
          organizationId: 'org-1',
          platform: 'GOOGLE_ADS',
        },
      });
    });
  });

  describe('patchScoped', () => {
    it('uses an atomic tenant-and-brand-scoped write and drops ownership fields', async () => {
      delegate.findFirst.mockResolvedValue({
        brandId: 'brand-1',
        id: 'advertiser-3',
        organizationId: 'org-1',
      });

      await service.patchScoped(
        'advertiser-3',
        {
          advertiserName: 'New Name',
          brandId: 'sneaky-brand',
          isDeleted: true,
          organizationId: 'sneaky-org',
        },
        {
          brandId: 'brand-1',
          organizationId: 'org-1',
        },
      );

      expect(delegate.updateMany).toHaveBeenCalledWith({
        data: { advertiserName: 'New Name' },
        where: {
          brandId: 'brand-1',
          id: 'advertiser-3',
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
    });
  });

  describe('removeScoped', () => {
    it('returns the updated tombstone directly from the scoped write', async () => {
      const result = await service.removeScoped('advertiser-3', {
        brandId: 'brand-1',
        organizationId: 'org-1',
      });

      expect(delegate.update).toHaveBeenCalledWith({
        data: { isDeleted: true },
        where: {
          brandId: 'brand-1',
          id: 'advertiser-3',
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
      expect(result).toMatchObject({
        id: 'advertiser-3',
        isDeleted: true,
        organizationId: 'org-1',
      });
    });
  });

  describe('findByHandle', () => {
    it('scopes to active rows by default', async () => {
      await service.findByHandle('org-1', 'meta', 'nike');

      expect(delegate.findFirst).toHaveBeenCalledWith({
        where: {
          advertiserHandle: 'nike',
          brandId: null,
          isDeleted: false,
          organizationId: 'org-1',
          platform: 'meta',
        },
      });
    });

    it('includes soft-deleted rows when asked, for the revive-on-recreate lookup', async () => {
      await service.findByHandle('org-1', 'meta', 'nike', null, {
        includeDeleted: true,
      });

      expect(delegate.findFirst).toHaveBeenCalledWith({
        where: {
          advertiserHandle: 'nike',
          brandId: null,
          isDeleted: undefined,
          organizationId: 'org-1',
          platform: 'meta',
        },
      });
    });

    it('includes the brand in the natural-key lookup', async () => {
      await service.findByHandle('org-1', 'meta', 'nike', 'brand-1');

      expect(delegate.findFirst).toHaveBeenCalledWith({
        where: {
          advertiserHandle: 'nike',
          brandId: 'brand-1',
          isDeleted: false,
          organizationId: 'org-1',
          platform: 'meta',
        },
      });
    });
  });

  describe('findAllByAccount', () => {
    it('scopes to the organization and, when given, the brand', async () => {
      await service.findAllByAccount('org-1', 'brand-1');

      expect(delegate.findMany).toHaveBeenCalledWith({
        where: {
          brandId: 'brand-1',
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
    });

    it('narrows to one platform so a Meta ingestion run never touches X rows (#3537)', async () => {
      await service.findAllByAccount('org-1', undefined, 'meta');

      expect(delegate.findMany).toHaveBeenCalledWith({
        where: {
          isDeleted: false,
          organizationId: 'org-1',
          platform: 'meta',
        },
      });
    });
  });

  describe('recordIngestionResult', () => {
    it('records a successful snapshot without fabricating success time on failures', async () => {
      delegate.findFirst.mockResolvedValue({
        id: 'advertiser-4',
        organizationId: 'org-1',
      });

      await service.recordIngestionResult('advertiser-4', 'org-1', {
        freshnessState: 'fresh',
        recordCount: 12,
        snapshotId: 'snapshot-1',
        status: 'success',
      });

      expect(delegate.updateMany).toHaveBeenCalledWith({
        data: {
          freshnessState: 'fresh',
          lastAttemptedAt: expect.any(Date),
          lastIngestionErrorCode: null,
          lastIngestionStatus: 'success',
          lastSnapshotId: 'snapshot-1',
          lastSnapshotRecordCount: 12,
          lastSuccessfulAt: expect.any(Date),
        },
        where: {
          id: 'advertiser-4',
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
    });

    it('records only a safe error code and does not advance successful snapshot fields', async () => {
      delegate.findFirst.mockResolvedValue({
        id: 'advertiser-4',
        organizationId: 'org-1',
      });

      await service.recordIngestionResult('advertiser-4', 'org-1', {
        errorCode: 'paid_creative_apify_token_missing',
        freshnessState: 'unavailable',
        status: 'unavailable',
      });

      expect(delegate.updateMany).toHaveBeenCalledWith({
        data: {
          freshnessState: 'unavailable',
          lastAttemptedAt: expect.any(Date),
          lastIngestionErrorCode: 'paid_creative_apify_token_missing',
          lastIngestionStatus: 'unavailable',
        },
        where: {
          id: 'advertiser-4',
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
    });

    it('returns null when the scoped atomic write finds no advertiser in this organization', async () => {
      delegate.findFirst.mockResolvedValue(null);
      delegate.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.recordIngestionResult('missing', 'org-1', {
        freshnessState: 'fresh',
        status: 'success',
      });

      expect(result).toBeNull();
      expect(delegate.updateMany).toHaveBeenCalledWith({
        data: expect.objectContaining({ lastIngestionStatus: 'success' }),
        where: {
          id: 'missing',
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
    });
  });
});
