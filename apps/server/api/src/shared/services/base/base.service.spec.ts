import { ValidationException } from '@api/exceptions/validation.exception';
import type { ModelFieldMeta } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';

// ---------------------------------------------------------------------------
// vi.hoisted — runs BEFORE the vi.mock factory, so the mock can reference it.
// ---------------------------------------------------------------------------
const { getModelMetaMock } = vi.hoisted(() => {
  const BASE_META: ModelFieldMeta = {
    allFields: ['id', 'isDeleted', 'organizationId'],
    enumFields: {},
    listFields: [],
    relationIdFields: {},
  };
  return {
    getModelMetaMock: vi.fn<[string], ModelFieldMeta | undefined>(
      () => BASE_META,
    ),
  };
});

/**
 * Stable meta for the test model used across most cases:
 * just id + organizationId + isDeleted — no enum fields.
 */
const BASE_META: ModelFieldMeta = {
  allFields: ['id', 'isDeleted', 'organizationId'],
  enumFields: {},
  listFields: [],
  relationIdFields: {},
};

// ---------------------------------------------------------------------------
// Module mock — must run before any imports that pull in BaseService.
// Spreads the canonical, schema-derived enum set (real ArticleStatus,
// AssetScope, IngredientCategory, IngredientStatus, OrganizationCategory,
// ApiKeyCategory, SubscriptionStatus, PromptCategory, etc. — no more
// hand-rolled partial copies), then overrides two keys AFTER the spread so
// object-literal key order lets the overrides win:
//   - getModelMeta: backed by the vi.hoisted vi.fn so individual tests can
//     call mockReturnValue() to inject specific field sets for that test.
//   - TaskStatus: intentionally undefined (the real schema DOES define a
//     TaskStatus enum) — lets the diverged-enum test below verify that
//     getPrismaEnumValues returns null → candidate passes through as-is.
// ---------------------------------------------------------------------------
vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return {
    ...canonicalPrismaMock(),
    getModelMeta: getModelMetaMock,
    TaskStatus: undefined,
  };
});

import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';

// ---------------------------------------------------------------------------
// Helper — replace model meta for the duration of a single test.
// ---------------------------------------------------------------------------
type FieldSpec =
  | string
  | { name: string; kind?: string; type?: string; isRequired?: boolean };

function makeModelMeta(...fields: FieldSpec[]): ModelFieldMeta {
  const allFields: string[] = [];
  const listFields: string[] = [];
  const enumFields: Record<string, { enumType: string; isRequired: boolean }> =
    {};

  for (const f of fields) {
    if (typeof f === 'string') {
      allFields.push(f);
    } else {
      if (f.kind === 'list') {
        listFields.push(f.name);
      } else {
        allFields.push(f.name);
      }
      if (f.kind === 'enum' && f.type) {
        enumFields[f.name] = {
          enumType: f.type,
          isRequired: f.isRequired ?? false,
        };
      }
    }
  }

  return { allFields, enumFields, listFields, relationIdFields: {} };
}

describe('BaseService', () => {
  type TestDocument = Record<string, unknown>;

  class TestService extends BaseService<TestDocument> {}

  let service: TestService;
  let prisma: PrismaService;
  let delegate: Record<string, ReturnType<typeof vi.fn>>;
  let logger: LoggerService;
  let cacheService: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    invalidateByTags: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Reset to base meta (id + organizationId + isDeleted, no enums).
    getModelMetaMock.mockReturnValue(BASE_META);

    logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as Partial<LoggerService> as LoggerService;
    cacheService = {
      get: vi.fn().mockResolvedValue(null),
      invalidateByTags: vi.fn(),
      set: vi.fn(),
    };

    delegate = {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    };

    prisma = {
      testModel: delegate,
    } as unknown as PrismaService;

    service = new TestService(
      prisma,
      'testModel',
      logger,
      undefined,
      cacheService as never,
    );
  });

  describe('create', () => {
    it('creates a document and returns the created entity', async () => {
      const created = { id: 'id_1', foo: 'bar' };
      delegate.create.mockResolvedValue(created);

      const result = await service.create({ foo: 'bar' });

      expect(delegate.create).toHaveBeenCalledWith({
        data: { foo: 'bar' },
      });
      expect(result).toEqual({ ...created });
    });

    it('creates a document with include when populate is provided', async () => {
      getModelMetaMock.mockReturnValue(
        makeModelMeta('id', 'isDeleted', 'organizationId', 'user'),
      );
      const created = { id: 'id_1', foo: 'bar', user: { id: 'u1' } };
      delegate.create.mockResolvedValue(created);

      const result = await service.create({ foo: 'bar' }, ['user']);

      expect(delegate.create).toHaveBeenCalledWith({
        data: { foo: 'bar' },
        include: { user: true },
      });
      expect(result).toEqual({ ...created });
    });

    it('throws ValidationException when createDto is undefined', async () => {
      await expect(
        service.create(undefined as unknown as TestDocument),
      ).rejects.toThrow(ValidationException);
    });

    it('propagates database errors', async () => {
      const dbError = new Error('DB connection failed');
      delegate.create.mockRejectedValue(dbError);

      await expect(service.create({ foo: 'bar' })).rejects.toThrow(dbError);
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to create document',
        expect.objectContaining({ error: dbError }),
      );
    });
  });

  describe('findAll', () => {
    it('returns paginated results', async () => {
      delegate.findMany.mockResolvedValue([{ id: '1' }]);
      delegate.count.mockResolvedValue(1);

      const result = await service.findAll(
        { where: {} },
        { page: 1, limit: 10 },
      );

      expect(result.docs).toHaveLength(1);
      expect(result.totalDocs).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(result.hasNextPage).toBe(false);

      // The cached page carries the collection-scoped paginated tag (used by
      // every per-write invalidation) plus the reserved global tag (used only
      // by the deliberate system-wide flush helper) — never a bare
      // collection-agnostic 'query:paginated' tag.
      expect(cacheService.set).toHaveBeenCalledWith(
        expect.any(String),
        result,
        expect.objectContaining({
          tags: [
            'collection:testModel',
            'query:testModel',
            'query:paginated:testModel',
            'query:paginated:all',
          ],
          ttl: 300,
        }),
      );
    });

    it('returns all docs without pagination when pagination: false', async () => {
      delegate.findMany.mockResolvedValue([{ id: '1' }, { id: '2' }]);

      const result = await service.findAll(
        { where: {} },
        { pagination: false },
      );

      expect(result.docs).toHaveLength(2);
      expect(result.totalDocs).toBe(2);
      expect(result.totalPages).toBe(1);
      expect(delegate.count).not.toHaveBeenCalled();
    });

    it('omits soft-delete filters for models without isDeleted', async () => {
      getModelMetaMock.mockReturnValue(makeModelMeta('id', 'organizationId'));
      delegate.findMany.mockResolvedValue([{ id: '1' }]);
      delegate.count.mockResolvedValue(1);

      await service.findAll({ where: {} }, { page: 1, limit: 10 });

      expect(delegate.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: [{ createdAt: 'desc' }],
        skip: 0,
        take: 10,
      });
      expect(delegate.count).toHaveBeenCalledWith({ where: {} });
    });

    it('computes hasNextPage / prevPage correctly', async () => {
      delegate.findMany.mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => ({ id: String(i) })),
      );
      delegate.count.mockResolvedValue(25);

      const result = await service.findAll(
        { where: {} },
        { page: 2, limit: 10 },
      );

      expect(result.hasNextPage).toBe(true);
      expect(result.hasPrevPage).toBe(true);
      expect(result.nextPage).toBe(3);
      expect(result.prevPage).toBe(1);
    });

    it('uses resolved filters in cache keys', async () => {
      delegate.findMany.mockResolvedValue([{ id: '1' }]);
      delegate.count.mockResolvedValue(1);
      cacheService.get.mockResolvedValue(null);

      await service.findAll(
        { where: { organizationId: 'org-1' } },
        { page: 1, limit: 10 },
      );
      await service.findAll(
        { where: { organizationId: 'org-2' } },
        { page: 1, limit: 10 },
      );

      expect(cacheService.get).toHaveBeenCalledTimes(2);
      const [firstKey] = cacheService.get.mock.calls[0];
      const [secondKey] = cacheService.get.mock.calls[1];
      expect(firstKey).not.toBe(secondKey);
    });

    it('applies explicit Prisma where, orderBy, and include options', async () => {
      getModelMetaMock.mockReturnValue(
        makeModelMeta(
          'id',
          'isDeleted',
          'organizationId',
          'organization',
          'label',
          'status',
        ),
      );
      delegate.findMany.mockResolvedValue([{ id: '1' }]);
      delegate.count.mockResolvedValue(1);

      await service.findAll(
        {
          include: { organization: true },
          orderBy: { label: 'asc' },
          where: {
            organizationId: 'org-1',
            status: { in: ['active', 'pending'] },
          },
        },
        { page: 1, limit: 10 },
      );

      expect(delegate.findMany).toHaveBeenCalledWith({
        include: { organization: true },
        orderBy: [{ label: 'asc' }],
        skip: 0,
        take: 10,
        where: {
          isDeleted: false,
          organizationId: 'org-1',
          status: { in: ['active', 'pending'] },
        },
      });
      expect(delegate.count).toHaveBeenCalledWith({
        where: {
          isDeleted: false,
          organizationId: 'org-1',
          status: { in: ['active', 'pending'] },
        },
      });
    });

    it('applies explicit Prisma select options', async () => {
      getModelMetaMock.mockReturnValue(
        makeModelMeta('id', 'isDeleted', 'organizationId', 'platformRole'),
      );
      delegate.findMany.mockResolvedValue([{ id: '1', platformRole: 'USER' }]);
      delegate.count.mockResolvedValue(1);

      await service.findAll(
        {
          orderBy: { id: 'asc' },
          select: { id: true, platformRole: true },
          where: { organizationId: 'org-1' },
        },
        { page: 1, limit: 10 },
      );

      expect(delegate.findMany).toHaveBeenCalledWith({
        orderBy: [{ id: 'asc' }],
        select: { id: true, platformRole: true },
        skip: 0,
        take: 10,
        where: {
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
      expect(delegate.count).toHaveBeenCalledWith({
        where: {
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
    });

    it('normalizes scalar operators on canonical relation ID fields', async () => {
      getModelMetaMock.mockReturnValue(
        makeModelMeta(
          'id',
          'isDeleted',
          { name: 'brandId', isRequired: false },
          { kind: 'enum', name: 'category', type: 'IngredientCategory' },
          { kind: 'enum', name: 'status', type: 'IngredientStatus' },
        ),
      );
      delegate.findMany.mockResolvedValue([]);
      delegate.count.mockResolvedValue(0);

      await service.findAll(
        {
          where: {
            AND: [
              {
                brandId: { not: null },
                category: 'image',
                status: {
                  in: ['generated', 'processing', 'validated'],
                },
              },
            ],
          },
        },
        { page: 1, limit: 48 },
      );

      expect(delegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              {
                brandId: { not: null },
                category: 'IMAGE',
                status: {
                  in: ['GENERATED', 'PROCESSING', 'VALIDATED'],
                },
              },
            ],
            isDeleted: false,
          },
        }),
      );
      expect(delegate.count).toHaveBeenCalledWith({
        where: {
          AND: [
            {
              brandId: { not: null },
              category: 'IMAGE',
              status: {
                in: ['GENERATED', 'PROCESSING', 'VALIDATED'],
              },
            },
          ],
          isDeleted: false,
        },
      });
    });

    it('drops required not-null tautologies while preserving relation null filters', async () => {
      getModelMetaMock.mockReturnValue(
        makeModelMeta(
          'id',
          'isDeleted',
          { name: 'organizationId', isRequired: true },
          { name: 'brandId', isRequired: false },
          { isRequired: true, kind: 'enum', name: 'scope', type: 'AssetScope' },
        ),
      );
      delegate.findMany.mockResolvedValue([]);
      delegate.count.mockResolvedValue(0);

      await service.findAll(
        {
          where: {
            OR: [
              { brandId: null, organizationId: 'org-1' },
              { brandId: 'brand-1' },
            ],
            scope: { not: null },
          },
        },
        { page: 1, limit: 10 },
      );

      expect(delegate.findMany).toHaveBeenCalledWith({
        orderBy: [{ createdAt: 'desc' }],
        skip: 0,
        take: 10,
        where: {
          OR: [
            { brandId: null, organizationId: 'org-1' },
            { brandId: 'brand-1' },
          ],
          isDeleted: false,
        },
      });
      expect(delegate.count).toHaveBeenCalledWith({
        where: {
          OR: [
            { brandId: null, organizationId: 'org-1' },
            { brandId: 'brand-1' },
          ],
          isDeleted: false,
        },
      });
    });

    it('passes through genuinely diverged enum values unchanged', async () => {
      // TaskStatus JS values (e.g. 'todo') have no Prisma enum equivalent — pass through.
      getModelMetaMock.mockReturnValue(
        makeModelMeta('id', 'isDeleted', {
          kind: 'enum',
          name: 'status',
          type: 'TaskStatus',
        }),
      );
      // Mock TaskStatus enum not available → getPrismaEnumValues returns null → passes through.
      delegate.findMany.mockResolvedValue([]);
      delegate.count.mockResolvedValue(0);

      await service.findAll(
        { where: { status: 'todo' } },
        { page: 1, limit: 10 },
      );

      // 'todo'.toUpperCase() = 'TODO' — if 'TODO' not in enum set, value passes through as 'todo'.
      // Since TaskStatus is not in our mock, enumValues will be null → candidate returned as-is.
      // The candidate from toPrismaEnumCandidate is 'TODO'.
      expect(delegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'TODO' }),
        }),
      );
    });
  });

  describe('find', () => {
    it('calls findMany with processed params', async () => {
      delegate.findMany.mockResolvedValue([{ id: '1' }]);

      const result = await service.find({ status: 'active' });

      expect(delegate.findMany).toHaveBeenCalledWith({
        where: { isDeleted: false, status: 'active' },
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('returns a document when found', async () => {
      const doc = { id: 'id_1' };
      delegate.findFirst.mockResolvedValue(doc);

      const result = await service.findOne({ id: 'id_1' });

      expect(delegate.findFirst).toHaveBeenCalledWith({
        where: { id: 'id_1', isDeleted: false },
      });
      expect(result).toEqual({ ...doc });
    });

    it('throws ValidationException when params is null', async () => {
      await expect(
        service.findOne(null as unknown as Record<string, unknown>),
      ).rejects.toThrow(ValidationException);
    });

    it('returns null without querying when id is undefined', async () => {
      const result = await service.findOne({
        id: undefined,
        isDeleted: false,
      });

      expect(result).toBeNull();
      expect(delegate.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('patch', () => {
    it('updates a document by id', async () => {
      const updated = { id: 'id_1', foo: 'updated' };
      delegate.update.mockResolvedValue(updated);

      const result = await service.patch('id_1', { foo: 'updated' });

      expect(delegate.update).toHaveBeenCalledWith({
        where: { id: 'id_1' },
        data: { foo: 'updated' },
      });
      expect(result).toEqual({ ...updated });
    });

    it('throws ValidationException when id is falsy', async () => {
      await expect(
        service.patch('' as unknown as string, { foo: 'bar' }),
      ).rejects.toThrow(ValidationException);
    });

    it('throws ValidationException when updateDto is null', async () => {
      await expect(
        service.patch('id_1', null as unknown as Record<string, unknown>),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe('patchAll', () => {
    it('bulk updates matching documents', async () => {
      delegate.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.patchAll(
        { status: 'old' },
        { status: 'new' },
      );

      expect(delegate.updateMany).toHaveBeenCalledWith({
        where: { isDeleted: false, status: 'old' },
        data: { status: 'new' },
      });
      expect(result).toEqual({ modifiedCount: 3 });
    });

    it('throws ValidationException when filter is null', async () => {
      await expect(
        service.patchAll(null as unknown as Record<string, unknown>, {}),
      ).rejects.toThrow(ValidationException);
    });

    it('throws ValidationException when update is null', async () => {
      await expect(
        service.patchAll({}, null as unknown as Record<string, unknown>),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe('remove', () => {
    it('soft deletes a document by setting isDeleted: true', async () => {
      const deleted = { id: 'id_1', isDeleted: true };
      delegate.update.mockResolvedValue(deleted);

      const result = await service.remove('id_1');

      expect(delegate.update).toHaveBeenCalledWith({
        where: { id: 'id_1' },
        data: { isDeleted: true },
      });
      expect(result).toEqual({ ...deleted });
    });

    it('throws ValidationException when id is falsy', async () => {
      await expect(service.remove(null as unknown as string)).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe('cache tag scoping', () => {
    it('scopes the paginated-query cache tag to the writing collection on create/patch/remove', async () => {
      delegate.create.mockResolvedValue({ id: 'id_1' });
      await service.create({ foo: 'bar' });
      expect(cacheService.invalidateByTags).toHaveBeenLastCalledWith([
        'testModel',
        'collection:testModel',
        'query:testModel',
        'query:paginated:testModel',
      ]);

      delegate.update.mockResolvedValue({ id: 'id_1', foo: 'updated' });
      await service.patch('id_1', { foo: 'updated' });
      expect(cacheService.invalidateByTags).toHaveBeenLastCalledWith([
        'testModel',
        'collection:testModel',
        'query:testModel',
        'query:paginated:testModel',
      ]);

      delegate.update.mockResolvedValue({ id: 'id_1', isDeleted: true });
      await service.remove('id_1');
      expect(cacheService.invalidateByTags).toHaveBeenLastCalledWith([
        'testModel',
        'collection:testModel',
        'query:testModel',
        'query:paginated:testModel',
      ]);
    });

    it('does not invalidate another collection’s paginated-query cache tag on write', async () => {
      class OtherTestService extends BaseService<TestDocument> {}
      const otherDelegate = {
        create: vi.fn().mockResolvedValue({ id: 'id_2' }),
      };
      const otherPrisma = {
        otherModel: otherDelegate,
      } as unknown as PrismaService;
      const otherService = new OtherTestService(
        otherPrisma,
        'otherModel',
        logger,
        undefined,
        cacheService as never,
      );

      // A write to `testModel` must not carry `otherModel`'s tag.
      delegate.create.mockResolvedValue({ id: 'id_1' });
      await service.create({ foo: 'bar' });
      let tags = cacheService.invalidateByTags.mock.calls.at(-1)?.[0];
      expect(tags).toContain('query:paginated:testModel');
      expect(tags).not.toContain('query:paginated:otherModel');

      // A write to `otherModel` must not carry `testModel`'s tag.
      await otherService.create({ foo: 'bar' });
      tags = cacheService.invalidateByTags.mock.calls.at(-1)?.[0];
      expect(tags).toContain('query:paginated:otherModel');
      expect(tags).not.toContain('query:paginated:testModel');
    });
  });

  describe('auditUnknownFilterFields (stage-4 runtime guard)', () => {
    it('warns when a filter references a field the model lacks', async () => {
      getModelMetaMock.mockReturnValue(
        makeModelMeta('id', 'organizationId', 'isDeleted'),
      );
      delegate.findMany.mockResolvedValue([]);
      delegate.count.mockResolvedValue(0);

      await service.findAll(
        { where: { status: 'active' } },
        { page: 1, limit: 10 },
      );

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('unknown field "status"'),
        expect.objectContaining({ field: 'status', model: 'testModel' }),
      );
    });
  });

  describe('findAllByOrganization', () => {
    it('applies additional filters', async () => {
      delegate.findMany.mockResolvedValue([]);

      await service.findAllByOrganization('org1', { status: 'active' });

      expect(delegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org1',
            isDeleted: false,
            status: 'active',
          }),
        }),
      );
    });

    it('maps organization sort fields with the original numeric direction contract', async () => {
      delegate.findMany.mockResolvedValue([]);

      await service.findAllByOrganization('org1', undefined, {
        createdAt: -1,
        priority: 1,
      });

      expect(delegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ createdAt: 'desc' }, { priority: 'asc' }],
        }),
      );
    });

    it('drops the QueryBuilder soft-delete seed for models without isDeleted', async () => {
      getModelMetaMock.mockReturnValue(makeModelMeta('id', 'organizationId'));
      delegate.findMany.mockResolvedValue([]);

      await service.findAllByOrganization('org1');

      const [call] = delegate.findMany.mock.calls.at(-1) as [
        { where: Record<string, unknown> },
      ];
      expect(call.where).not.toHaveProperty('isDeleted');
      expect(call.where).toMatchObject({ organizationId: 'org1' });
    });
  });

  describe('updateEntityFlag', () => {
    it('updates a boolean flag with org isolation check', async () => {
      delegate.findFirst.mockResolvedValue({ id: 'id_1' });
      delegate.update.mockResolvedValue({ id: 'id_1', isRead: true });

      const result = await service.updateEntityFlag(
        'id_1',
        'org_1',
        'isRead' as keyof TestDocument & string,
        true,
      );

      expect(delegate.findFirst).toHaveBeenCalledWith({
        where: { id: 'id_1', organizationId: 'org_1', isDeleted: false },
        select: { id: true },
      });
      expect(delegate.update).toHaveBeenCalledWith({
        where: { id: 'id_1' },
        data: { isRead: true },
      });
      expect(result).toEqual({ id: 'id_1', isRead: true });
    });

    it('returns null when document not found or not in org', async () => {
      delegate.findFirst.mockResolvedValue(null);

      const result = await service.updateEntityFlag(
        'id_missing',
        'org_1',
        'isRead' as keyof TestDocument & string,
      );

      expect(result).toBeNull();
      expect(delegate.update).not.toHaveBeenCalled();
    });
  });

  describe('bulkUpdateEntityFlag', () => {
    it('updates flag on multiple IDs with org isolation', async () => {
      delegate.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.bulkUpdateEntityFlag(
        ['id_1', 'id_2'],
        'org_1',
        'isArchived' as keyof TestDocument & string,
        true,
      );

      expect(delegate.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['id_1', 'id_2'] },
          organizationId: 'org_1',
          isDeleted: false,
        },
        data: { isArchived: true },
      });
      expect(result).toEqual({ modifiedCount: 2 });
    });
  });

  describe('logOperation', () => {
    it('logs error for failed operations', () => {
      service.logOperation('test', 'failed', 'error detail');
      expect(logger.error).toHaveBeenCalledWith(
        'TestService test failed',
        'error detail',
      );
    });

    it('logs info for started/completed operations', () => {
      service.logOperation('test', 'started');
      expect(logger.log).toHaveBeenCalledWith(
        'TestService test started',
        undefined,
      );
    });
  });

  describe('subclass normalization seams', () => {
    it('routes recursive OR and AND normalization through a normalizeWhere override', async () => {
      class WhereOverrideTestService extends BaseService<TestDocument> {
        public readonly normalizedWhereInputs: Record<string, unknown>[] = [];

        protected override normalizeWhere(
          where: Record<string, unknown> = {},
        ): Record<string, unknown> {
          this.normalizedWhereInputs.push(where);
          return super.normalizeWhere(where);
        }
      }
      const overrideService = new WhereOverrideTestService(
        prisma,
        'testModel',
        logger,
        undefined,
        cacheService as never,
      );
      delegate.findMany.mockResolvedValue([]);
      const rawWhere = {
        AND: [{ id: 'id_1' }],
        OR: [{ organizationId: 'org_1' }],
      };

      await overrideService.find(rawWhere);

      expect(overrideService.normalizedWhereInputs).toEqual([
        rawWhere,
        { id: 'id_1' },
        { organizationId: 'org_1' },
      ]);
      expect(delegate.findMany).toHaveBeenCalledWith({
        where: {
          AND: [{ id: 'id_1' }],
          OR: [{ organizationId: 'org_1' }],
          isDeleted: false,
        },
      });
    });
  });

  describe('normalizeData', () => {
    it('drops write keys whose operator value normalizes to undefined', async () => {
      getModelMetaMock.mockReturnValue(
        makeModelMeta('id', 'label', {
          isRequired: true,
          kind: 'enum',
          name: 'scope',
          type: 'AssetScope',
        }),
      );
      const created = { id: 'ing_undefined_operator', label: 'kept' };
      delegate.create.mockResolvedValue(created);

      await service.create({
        label: 'kept',
        scope: { not: null },
      });

      expect(delegate.create).toHaveBeenCalledWith({
        data: { label: 'kept' },
      });
    });
  });
});
