import type { PrismaAdOptimizationConfig } from '@api/collections/ad-optimization-configs/schemas/ad-optimization-config.schema';
import { DEFAULT_AD_OPTIMIZATION_CONFIG } from '@api/collections/ad-optimization-configs/schemas/ad-optimization-config.schema';
import type { ServerLogger, ServerPrisma } from '@api/server.dependencies';
import { AdOptimizationConfigsService } from './ad-optimization-configs.service';

const NOW = new Date('2026-08-01T00:00:00.000Z');

function makeRow(
  config: unknown,
  overrides: Partial<PrismaAdOptimizationConfig> = {},
): PrismaAdOptimizationConfig {
  return {
    config: config as PrismaAdOptimizationConfig['config'],
    createdAt: NOW,
    id: 'cfg-1',
    isDeleted: false,
    organizationId: 'org-1',
    updatedAt: NOW,
    ...overrides,
  } as PrismaAdOptimizationConfig;
}

describe('AdOptimizationConfigsService', () => {
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
    adOptimizationConfig: { create, findFirst, findMany, update },
  } as unknown as Pick<ServerPrisma, 'adOptimizationConfig'>;
  const service = new AdOptimizationConfigsService(prisma, logger);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findByOrganization', () => {
    it('returns null when the tenant has no config row', async () => {
      findFirst.mockResolvedValue(null);

      await expect(service.findByOrganization('org-1')).resolves.toBeNull();
      expect(findFirst).toHaveBeenCalledWith({
        where: { isDeleted: false, organizationId: 'org-1' },
      });
    });

    it('fills every value with its default when the JSON column is empty', async () => {
      findFirst.mockResolvedValue(makeRow({}));

      const doc = await service.findByOrganization('org-1');

      expect(doc).toMatchObject(DEFAULT_AD_OPTIMIZATION_CONFIG);
      expect(doc?.config).toEqual({});
    });

    it('normalises numeric strings and boolean strings from the JSON column', async () => {
      findFirst.mockResolvedValue(
        makeRow({ isEnabled: 'true', minRoas: '4.5' }),
      );

      const doc = await service.findByOrganization('org-1');

      expect(doc?.isEnabled).toBe(true);
      expect(doc?.minRoas).toBe(4.5);
    });

    it.each([
      ['false', false],
      ['  TRUE  ', true],
      ['maybe', DEFAULT_AD_OPTIMIZATION_CONFIG.isEnabled],
      [1, DEFAULT_AD_OPTIMIZATION_CONFIG.isEnabled],
    ])('coerces the isEnabled value %s to %s', async (raw, expected) => {
      findFirst.mockResolvedValue(makeRow({ isEnabled: raw }));

      const doc = await service.findByOrganization('org-1');

      expect(doc?.isEnabled).toBe(expected);
    });

    it.each([
      [Number.NaN],
      [Number.POSITIVE_INFINITY],
      ['not-a-number'],
      [null],
      [{ nested: true }],
    ])('falls back to the default for the unusable minCtr %s', async (raw) => {
      findFirst.mockResolvedValue(makeRow({ minCtr: raw }));

      const doc = await service.findByOrganization('org-1');

      expect(doc?.minCtr).toBe(DEFAULT_AD_OPTIMIZATION_CONFIG.minCtr);
    });

    it.each([[null], ['a string'], [[1, 2, 3]]])(
      'treats the non-object config column %s as empty',
      async (raw) => {
        findFirst.mockResolvedValue(makeRow(raw));

        const doc = await service.findByOrganization('org-1');

        expect(doc?.config).toEqual({});
        expect(doc).toMatchObject(DEFAULT_AD_OPTIMIZATION_CONFIG);
      },
    );
  });

  describe('upsert', () => {
    it('creates a new row when the tenant has none', async () => {
      findFirst.mockResolvedValue(null);
      create.mockImplementation(
        (args: { data: { config: unknown } }): PrismaAdOptimizationConfig =>
          makeRow(args.data.config),
      );

      const doc = await service.upsert('org-1', { minRoas: 3 });

      expect(create).toHaveBeenCalledWith({
        data: { config: { minRoas: 3 }, organizationId: 'org-1' },
      });
      expect(update).not.toHaveBeenCalled();
      expect(doc.minRoas).toBe(3);
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('upserted optimization config for org org-1'),
      );
    });

    it('merges over the existing config when a row exists', async () => {
      findFirst.mockResolvedValue(
        makeRow({ isEnabled: true, minRoas: 2, minSpend: 25 }),
      );
      update.mockImplementation(
        (args: { data: { config: unknown } }): PrismaAdOptimizationConfig =>
          makeRow(args.data.config),
      );

      const doc = await service.upsert('org-1', { minRoas: 5 });

      expect(update).toHaveBeenCalledWith({
        data: {
          config: { isEnabled: true, minRoas: 5, minSpend: 25 },
          organizationId: 'org-1',
        },
        where: { id: 'cfg-1', isDeleted: false, organizationId: 'org-1' },
      });
      expect(create).not.toHaveBeenCalled();
      expect(doc.minSpend).toBe(25);
    });

    it('accepts a nested config object alongside top-level keys', async () => {
      findFirst.mockResolvedValue(null);
      create.mockImplementation(
        (args: { data: { config: unknown } }): PrismaAdOptimizationConfig =>
          makeRow(args.data.config),
      );

      await service.upsert('org-1', {
        config: { maxCpm: 12, minSpend: 1 },
        minSpend: 99,
      });

      expect(create).toHaveBeenCalledWith({
        data: {
          config: { maxCpm: 12, minSpend: 99 },
          organizationId: 'org-1',
        },
      });
    });

    it('normalises incoming values before persisting them', async () => {
      findFirst.mockResolvedValue(null);
      create.mockImplementation(
        (args: { data: { config: unknown } }): PrismaAdOptimizationConfig =>
          makeRow(args.data.config),
      );

      await service.upsert('org-1', {
        isEnabled: 'true',
        minCtr: 'not-a-number',
        minSpend: '15',
      });

      expect(create).toHaveBeenCalledWith({
        data: {
          config: {
            isEnabled: true,
            minCtr: DEFAULT_AD_OPTIMIZATION_CONFIG.minCtr,
            minSpend: 15,
          },
          organizationId: 'org-1',
        },
      });
    });

    it('ignores keys outside the known config surface', async () => {
      findFirst.mockResolvedValue(null);
      create.mockImplementation(
        (args: { data: { config: unknown } }): PrismaAdOptimizationConfig =>
          makeRow(args.data.config),
      );

      await service.upsert('org-1', { organizationId: 'org-evil', rogue: 1 });

      expect(create).toHaveBeenCalledWith({
        data: { config: {}, organizationId: 'org-1' },
      });
    });

    it('logs and rethrows write failures', async () => {
      const dbError = new Error('update failed');
      findFirst.mockRejectedValue(dbError);

      await expect(service.upsert('org-1', {})).rejects.toThrowError(dbError);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        dbError,
      );
    });
  });

  describe('findAllEnabled', () => {
    it('returns rows selected by the enabled config predicate', async () => {
      findMany.mockResolvedValue([
        makeRow({ isEnabled: true }, { id: 'cfg-on' }),
      ]);

      const docs = await service.findAllEnabled();

      expect(docs).toHaveLength(1);
      expect(docs[0].id).toBe('cfg-on');
      expect(findMany).toHaveBeenCalledWith({
        where: {
          config: { equals: true, path: ['isEnabled'] },
          isDeleted: false,
        },
      });
    });
  });
});
