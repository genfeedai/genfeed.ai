import type { ServerLogger, ServerPrisma } from '@api/server.dependencies';
import { AdCreativeMappingsService } from './ad-creative-mappings.service';

function makeRow(id: string, data: Record<string, unknown>) {
  return { data, id, isDeleted: false, organizationId: 'org-1' };
}

describe('AdCreativeMappingsService', () => {
  const create = vi.fn();
  const findFirst = vi.fn();
  const findMany = vi.fn();
  const update = vi.fn();
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } satisfies ServerLogger;
  const prisma = {
    adCreativeMapping: { create, findFirst, findMany, update },
  } as unknown as Pick<ServerPrisma, 'adCreativeMapping'>;
  const service = new AdCreativeMappingsService(prisma, logger);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('defaults platform, status and metadata and packs them into the JSON column', async () => {
      create.mockResolvedValue({ id: 'map-1' });

      const doc = await service.create({
        adAccountId: 'act_1',
        genfeedContentId: 'content-1',
        organizationId: 'org-1',
      });

      expect(doc).toEqual({ id: 'map-1' });
      expect(create).toHaveBeenCalledWith({
        data: {
          brandId: null,
          data: {
            adAccountId: 'act_1',
            externalAdId: undefined,
            externalCreativeId: undefined,
            genfeedContentId: 'content-1',
            metadata: {},
            platform: 'meta',
            status: 'draft',
          },
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('created mapping map-1'),
      );
    });

    it('preserves explicit brand, platform, status and metadata', async () => {
      create.mockResolvedValue({ id: 'map-2' });

      await service.create({
        adAccountId: 'act_2',
        brandId: 'brand-1',
        externalAdId: 'ad-9',
        externalCreativeId: 'creative-9',
        genfeedContentId: 'content-2',
        metadata: { source: 'bulk' },
        organizationId: 'org-1',
        platform: 'google',
        status: 'active',
      });

      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          brandId: 'brand-1',
          data: expect.objectContaining({
            externalAdId: 'ad-9',
            externalCreativeId: 'creative-9',
            metadata: { source: 'bulk' },
            platform: 'google',
            status: 'active',
          }),
        }),
      });
    });

    it('logs and rethrows persistence failures', async () => {
      const dbError = new Error('insert failed');
      create.mockRejectedValue(dbError);

      await expect(
        service.create({
          adAccountId: 'act_1',
          genfeedContentId: 'content-1',
          organizationId: 'org-1',
        }),
      ).rejects.toThrowError(dbError);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        dbError,
      );
    });
  });

  describe('findById', () => {
    it('scopes the lookup to the tenant and excludes tombstones', async () => {
      findFirst.mockResolvedValue(null);

      await expect(service.findById('map-1', 'org-1')).resolves.toBeNull();
      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 'map-1', isDeleted: false, organizationId: 'org-1' },
      });
    });
  });

  describe('JSON-column lookups', () => {
    it('queries genfeedContentId inside the tenant scope', async () => {
      findMany.mockResolvedValue([
        makeRow('map-1', {
          adAccountId: 'act_1',
          externalAdId: 'ad-1',
          genfeedContentId: 'content-1',
        }),
        makeRow('map-2', {
          adAccountId: 'act_2',
          externalAdId: 'ad-2',
          genfeedContentId: 'content-1',
        }),
      ]);
      const rows = await service.findByContentId('content-1', 'org-1');

      expect(rows.map((row) => row.id)).toEqual(['map-1', 'map-2']);
      expect(findMany).toHaveBeenCalledWith({
        where: {
          data: { equals: 'content-1', path: ['genfeedContentId'] },
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
    });

    it('returns an empty list when no row matches the content id', async () => {
      findMany.mockResolvedValue([]);

      await expect(
        service.findByContentId('content-missing', 'org-1'),
      ).resolves.toEqual([]);
    });

    it('queries a single row by external ad id inside the tenant scope', async () => {
      findFirst.mockResolvedValue(
        makeRow('map-2', {
          adAccountId: 'act_2',
          externalAdId: 'ad-2',
          genfeedContentId: 'content-1',
        }),
      );
      const row = await service.findByExternalAdId('ad-2', 'org-1');

      expect(row?.id).toBe('map-2');
      expect(findFirst).toHaveBeenCalledWith({
        where: {
          data: { equals: 'ad-2', path: ['externalAdId'] },
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
    });

    it('returns null when no row carries the external ad id', async () => {
      findFirst.mockResolvedValue(null);

      await expect(
        service.findByExternalAdId('ad-missing', 'org-1'),
      ).resolves.toBeNull();
    });

    it('returns an empty list when no row matches the ad account', async () => {
      findMany.mockResolvedValue([]);

      await expect(
        service.findByAdAccount('account-missing', 'org-1'),
      ).resolves.toEqual([]);
    });

    it('queries ad account id inside the tenant scope', async () => {
      findMany.mockResolvedValue([
        makeRow('map-1', {
          adAccountId: 'act_1',
          externalAdId: 'ad-1',
          genfeedContentId: 'content-1',
        }),
      ]);
      const rows = await service.findByAdAccount('act_1', 'org-1');

      expect(rows.map((row) => row.id)).toEqual(['map-1']);
      expect(findMany).toHaveBeenCalledWith({
        where: {
          data: { equals: 'act_1', path: ['adAccountId'] },
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
    });
  });

  describe('update', () => {
    it('returns null when the row is outside the tenant scope', async () => {
      findFirst.mockResolvedValue(null);

      await expect(
        service.update('map-1', 'org-1', { status: 'active' }),
      ).resolves.toBeNull();
      expect(update).not.toHaveBeenCalled();
    });

    it('merges only the explicitly provided keys into the JSON column', async () => {
      findFirst.mockResolvedValue(
        makeRow('map-1', {
          adAccountId: 'act_1',
          metadata: { source: 'manual' },
          status: 'draft',
        }),
      );
      update.mockResolvedValue({ id: 'map-1' });

      await service.update('map-1', 'org-1', { status: 'active' });

      expect(update).toHaveBeenCalledWith({
        data: {
          data: {
            adAccountId: 'act_1',
            metadata: { source: 'manual' },
            status: 'active',
          },
        },
        where: { id: 'map-1', isDeleted: false, organizationId: 'org-1' },
      });
    });

    it('writes every provided key, including empty-string identifiers', async () => {
      findFirst.mockResolvedValue(makeRow('map-1', { status: 'draft' }));
      update.mockResolvedValue({ id: 'map-1' });

      await service.update('map-1', 'org-1', {
        externalAdId: '',
        externalCreativeId: 'creative-7',
        metadata: {},
        status: 'paused',
      });

      expect(update).toHaveBeenCalledWith({
        data: {
          data: {
            externalAdId: '',
            externalCreativeId: 'creative-7',
            metadata: {},
            status: 'paused',
          },
        },
        where: { id: 'map-1', isDeleted: false, organizationId: 'org-1' },
      });
    });

    it('treats a null JSON column as an empty object', async () => {
      findFirst.mockResolvedValue({
        data: null,
        id: 'map-3',
        isDeleted: false,
        organizationId: 'org-1',
      });
      update.mockResolvedValue({ id: 'map-3' });

      await service.update('map-3', 'org-1', { status: 'active' });

      expect(update).toHaveBeenCalledWith({
        data: { data: { status: 'active' } },
        where: { id: 'map-3', isDeleted: false, organizationId: 'org-1' },
      });
    });

    it('logs and rethrows write failures', async () => {
      const dbError = new Error('update failed');
      findFirst.mockRejectedValue(dbError);

      await expect(
        service.update('map-1', 'org-1', { status: 'active' }),
      ).rejects.toThrowError(dbError);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        dbError,
      );
    });
  });

  describe('softDelete', () => {
    it('returns false when the row is outside the tenant scope', async () => {
      findFirst.mockResolvedValue(null);

      await expect(service.softDelete('map-1', 'org-1')).resolves.toBe(false);
      expect(update).not.toHaveBeenCalled();
    });

    it('flips isDeleted rather than removing the row', async () => {
      findFirst.mockResolvedValue(makeRow('map-1', {}));
      update.mockResolvedValue({ id: 'map-1' });

      await expect(service.softDelete('map-1', 'org-1')).resolves.toBe(true);
      expect(update).toHaveBeenCalledWith({
        data: { isDeleted: true },
        where: { id: 'map-1', isDeleted: false, organizationId: 'org-1' },
      });
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('soft-deleted mapping map-1'),
      );
    });

    it('logs and rethrows delete failures', async () => {
      const dbError = new Error('delete failed');
      findFirst.mockResolvedValue(makeRow('map-1', {}));
      update.mockRejectedValue(dbError);

      await expect(service.softDelete('map-1', 'org-1')).rejects.toThrowError(
        dbError,
      );
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        dbError,
      );
    });
  });
});
