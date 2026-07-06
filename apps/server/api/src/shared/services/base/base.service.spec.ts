import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';
import type { ModelFieldMeta } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';

// ---------------------------------------------------------------------------
// vi.hoisted — runs BEFORE the vi.mock factory, so the mock can reference it.
// ---------------------------------------------------------------------------
const { getModelMetaMock } = vi.hoisted(() => {
  const BASE_META: ModelFieldMeta = {
    allFields: ['id', 'isDeleted', 'organizationId'],
    enumFields: {},
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
  const enumFields: Record<string, { enumType: string; isRequired: boolean }> =
    {};

  for (const f of fields) {
    if (typeof f === 'string') {
      allFields.push(f);
    } else {
      allFields.push(f.name);
      if (f.kind === 'enum' && f.type) {
        enumFields[f.name] = {
          enumType: f.type,
          isRequired: f.isRequired ?? false,
        };
      }
    }
  }

  return { allFields, enumFields };
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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('collectionName returns the modelName', () => {
    // @ts-expect-error accessing protected getter
    expect(service.collectionName).toBe('testModel');
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
      const created = { id: 'id_1', foo: 'bar', user: { id: 'u1' } };
      delegate.create.mockResolvedValue(created);

      const result = await service.create({ foo: 'bar' }, ['user']);

      expect(delegate.create).toHaveBeenCalledWith({
        data: { foo: 'bar' },
        include: { user: true },
      });
      expect(result).toEqual({ ...created });
    });

    it('throws ValidationException when createDto is null', async () => {
      await expect(
        service.create(null as unknown as TestDocument),
      ).rejects.toThrow(ValidationException);
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
        { where: { organization: 'org-1' } },
        { page: 1, limit: 10 },
      );
      await service.findAll(
        { where: { organization: 'org-2' } },
        { page: 1, limit: 10 },
      );

      expect(cacheService.get).toHaveBeenCalledTimes(2);
      const [firstKey] = cacheService.get.mock.calls[0];
      const [secondKey] = cacheService.get.mock.calls[1];
      expect(firstKey).not.toBe(secondKey);
    });

    it('applies explicit Prisma where, orderBy, and include options', async () => {
      delegate.findMany.mockResolvedValue([{ id: '1' }]);
      delegate.count.mockResolvedValue(1);

      await service.findAll(
        {
          include: { organization: true },
          orderBy: { label: 'asc' },
          where: {
            organization: 'org-1',
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
      delegate.findMany.mockResolvedValue([{ id: '1', platformRole: 'USER' }]);
      delegate.count.mockResolvedValue(1);

      await service.findAll(
        {
          orderBy: { id: 'asc' },
          select: { id: true, platformRole: true },
          where: { organization: 'org-1' },
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

    it('normalizes app enum filters to Prisma enum values', async () => {
      getModelMetaMock.mockReturnValue(
        makeModelMeta(
          'id',
          'isDeleted',
          { name: 'brandId', isRequired: false },
          { name: 'folderId', isRequired: false },
          { name: 'trainingId', isRequired: false },
          { kind: 'enum', name: 'category', type: 'IngredientCategory' },
          { isRequired: true, kind: 'enum', name: 'scope', type: 'AssetScope' },
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
                brand: 'brand-1',
                category: 'video',
                folder: null,
                scope: 'public',
                status: {
                  in: ['generated', 'processing', 'validated', 'completed'],
                },
                training: null,
              },
            ],
          },
        },
        { page: 1, limit: 30 },
      );

      expect(delegate.findMany).toHaveBeenCalledWith({
        orderBy: [{ createdAt: 'desc' }],
        skip: 0,
        take: 30,
        where: {
          AND: [
            {
              brandId: 'brand-1',
              category: 'VIDEO',
              folderId: null,
              scope: 'PUBLIC',
              status: {
                in: ['GENERATED', 'PROCESSING', 'VALIDATED', 'GENERATED'],
              },
              trainingId: null,
            },
          ],
          isDeleted: false,
        },
      });
    });

    it('maps scalar operator filters on legacy relation aliases to scalar FK fields', async () => {
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
                brand: { not: null },
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
            OR: [{ brand: null, organization: 'org-1' }, { brand: 'brand-1' }],
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

    it('maps legacy public article status to Prisma PUBLISHED', async () => {
      getModelMetaMock.mockReturnValue(
        makeModelMeta('id', 'isDeleted', 'publishedAt', {
          kind: 'enum',
          name: 'status',
          type: 'ArticleStatus',
        }),
      );
      delegate.findMany.mockResolvedValue([]);
      delegate.count.mockResolvedValue(0);

      await service.findAll(
        {
          where: {
            publishedAt: { not: null },
            status: 'public',
          },
        },
        { page: 1, limit: 15 },
      );

      expect(delegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isDeleted: false,
            publishedAt: { not: null },
            status: 'PUBLISHED',
          },
        }),
      );
    });

    it('does not normalize scalar status fields', async () => {
      getModelMetaMock.mockReturnValue(
        makeModelMeta('id', 'isDeleted', {
          kind: 'scalar',
          name: 'status',
          type: 'String',
        }),
      );
      delegate.findMany.mockResolvedValue([]);
      delegate.count.mockResolvedValue(0);

      await service.findAll(
        {
          where: {
            status: 'public',
          },
        },
        { page: 1, limit: 10 },
      );

      expect(delegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isDeleted: false,
            status: 'public',
          },
        }),
      );
    });

    it('normalizes scope:public → PUBLIC on an enum field', async () => {
      getModelMetaMock.mockReturnValue(
        makeModelMeta('id', 'isDeleted', {
          kind: 'enum',
          isRequired: true,
          name: 'scope',
          type: 'AssetScope',
        }),
      );
      delegate.findMany.mockResolvedValue([]);
      delegate.count.mockResolvedValue(0);

      await service.findAll(
        { where: { scope: 'public' } },
        { page: 1, limit: 10 },
      );

      expect(delegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ scope: 'PUBLIC' }),
        }),
      );
    });

    it('normalizes status:generated → GENERATED on an enum field', async () => {
      getModelMetaMock.mockReturnValue(
        makeModelMeta('id', 'isDeleted', {
          kind: 'enum',
          name: 'status',
          type: 'IngredientStatus',
        }),
      );
      delegate.findMany.mockResolvedValue([]);
      delegate.count.mockResolvedValue(0);

      await service.findAll(
        { where: { status: 'generated' } },
        { page: 1, limit: 10 },
      );

      expect(delegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'GENERATED' }),
        }),
      );
    });

    it('normalizes category:image → IMAGE on an enum field', async () => {
      getModelMetaMock.mockReturnValue(
        makeModelMeta('id', 'isDeleted', {
          kind: 'enum',
          name: 'category',
          type: 'IngredientCategory',
        }),
      );
      delegate.findMany.mockResolvedValue([]);
      delegate.count.mockResolvedValue(0);

      await service.findAll(
        { where: { category: 'image' } },
        { page: 1, limit: 10 },
      );

      expect(delegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'IMAGE' }),
        }),
      );
    });

    it('normalizes kebab category:image-edit → IMAGE_EDIT on an enum field', async () => {
      getModelMetaMock.mockReturnValue(
        makeModelMeta('id', 'isDeleted', {
          kind: 'enum',
          name: 'category',
          type: 'IngredientCategory',
        }),
      );
      delegate.findMany.mockResolvedValue([]);
      delegate.count.mockResolvedValue(0);

      await service.findAll(
        { where: { category: 'image-edit' } },
        { page: 1, limit: 10 },
      );

      expect(delegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'IMAGE_EDIT' }),
        }),
      );
    });

    it('normalizes alias opuspro → OPUS_PRO on ApiKeyCategory', async () => {
      getModelMetaMock.mockReturnValue(
        makeModelMeta('id', 'isDeleted', {
          kind: 'enum',
          name: 'category',
          type: 'ApiKeyCategory',
        }),
      );
      delegate.findMany.mockResolvedValue([]);
      delegate.count.mockResolvedValue(0);

      await service.findAll(
        { where: { category: 'opuspro' } },
        { page: 1, limit: 10 },
      );

      expect(delegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'OPUS_PRO' }),
        }),
      );
    });

    it('leaves Workflow.status active unchanged (String column, not a Prisma enum)', async () => {
      // Workflow.status is declared as String in schema, not WorkflowStatus enum.
      // The static metadata for "workflow" model does NOT have status in enumFields.
      getModelMetaMock.mockReturnValue(
        makeModelMeta('id', 'isDeleted', {
          kind: 'scalar',
          name: 'status',
          type: 'String',
        }),
      );
      delegate.findMany.mockResolvedValue([]);
      delegate.count.mockResolvedValue(0);

      await service.findAll(
        { where: { status: 'active' } },
        { page: 1, limit: 10 },
      );

      expect(delegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'active' }),
        }),
      );
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
        where: { status: 'active' },
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
        where: { id: 'id_1' },
      });
      expect(result).toEqual({ ...doc });
    });

    it('normalizes enum filters', async () => {
      getModelMetaMock.mockReturnValue(
        makeModelMeta('id', 'isDeleted', {
          kind: 'enum',
          name: 'status',
          type: 'ArticleStatus',
        }),
      );
      delegate.findFirst.mockResolvedValue(null);

      await service.findOne({ status: 'public' });

      expect(delegate.findFirst).toHaveBeenCalledWith({
        where: { status: 'PUBLISHED' },
      });
    });

    it('returns null when not found', async () => {
      delegate.findFirst.mockResolvedValue(null);
      const result = await service.findOne({ id: 'missing' });
      expect(result).toBeNull();
    });

    it('passes include to findFirst when populate is provided', async () => {
      delegate.findFirst.mockResolvedValue({ id: '1', brand: {} });
      await service.findOne({ id: '1' }, ['brand']);
      expect(delegate.findFirst).toHaveBeenCalledWith({
        where: { id: '1' },
        include: { brand: true },
      });
    });

    it('throws ValidationException when params is null', async () => {
      await expect(
        service.findOne(null as unknown as Record<string, unknown>),
      ).rejects.toThrow(ValidationException);
    });

    it('converts _id to id in params', async () => {
      delegate.findFirst.mockResolvedValue(null);
      await service.findOne({ _id: 'abc123' });
      expect(delegate.findFirst).toHaveBeenCalledWith({
        where: { id: 'abc123' },
      });
    });

    // normalizeWhere drops undefined values, so without the guard a lookup
    // like findOne({ _id: undefined }) degrades to an unscoped findFirst and
    // returns the first row in the table — a cross-tenant read.
    it('returns null (without querying) when _id is undefined', async () => {
      const result = await service.findOne({
        _id: undefined,
        isDeleted: false,
      });

      expect(result).toBeNull();
      expect(delegate.findFirst).not.toHaveBeenCalled();
    });

    it('returns null (without querying) when id is null', async () => {
      const result = await service.findOne({ id: null, isDeleted: false });

      expect(result).toBeNull();
      expect(delegate.findFirst).not.toHaveBeenCalled();
    });

    it('returns null (without querying) when id is an empty string', async () => {
      const result = await service.findOne({ id: '', isDeleted: false });

      expect(result).toBeNull();
      expect(delegate.findFirst).not.toHaveBeenCalled();
    });

    it('still queries when a non-id filter value is undefined', async () => {
      delegate.findFirst.mockResolvedValue(null);

      await service.findOne({ id: 'id_1', status: undefined });

      expect(delegate.findFirst).toHaveBeenCalledWith({
        where: { id: 'id_1' },
      });
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

    it('normalizes enum update data', async () => {
      getModelMetaMock.mockReturnValue(
        makeModelMeta('id', 'isDeleted', {
          kind: 'enum',
          name: 'status',
          type: 'ArticleStatus',
        }),
      );
      delegate.update.mockResolvedValue({ id: 'id_1', status: 'PUBLISHED' });

      await service.patch('id_1', { status: 'public' });

      expect(delegate.update).toHaveBeenCalledWith({
        where: { id: 'id_1' },
        data: { status: 'PUBLISHED' },
      });
    });

    it('passes null field updates through as Prisma data', async () => {
      delegate.update.mockResolvedValue({ id: 'id_1' });

      await service.patch('id_1', {
        name: 'NewName',
        oldField: null,
      });

      expect(delegate.update).toHaveBeenCalledWith({
        where: { id: 'id_1' },
        data: { name: 'NewName', oldField: null },
      });
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

    it('bulk updates with plain Prisma data', async () => {
      delegate.updateMany.mockResolvedValue({ count: 2 });

      await service.patchAll({ isDeleted: false }, { archived: true });

      expect(delegate.updateMany).toHaveBeenCalledWith({
        where: { isDeleted: false },
        data: { archived: true },
      });
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

  describe('processSearchParams', () => {
    it('remaps _id to id', () => {
      const result = service.processSearchParams({
        _id: 'abc123',
        status: 'ok',
      });
      expect(result).toEqual({ id: 'abc123', status: 'ok' });
    });

    it('matches legacy _id against both id and mongoId when available', () => {
      getModelMetaMock.mockReturnValue(
        makeModelMeta('id', 'mongoId', 'organizationId', 'isDeleted'),
      );

      const result = service.processSearchParams({
        _id: 'legacy_123',
        organization: 'org1',
      });

      expect(result).toEqual({
        OR: [{ id: 'legacy_123' }, { mongoId: 'legacy_123' }],
        organizationId: 'org1',
      });
    });

    it('remaps legacy organization string filters to organizationId', () => {
      const result = service.processSearchParams({
        organization: 'org1',
        type: 'post',
      });
      expect(result).toEqual({ organizationId: 'org1', type: 'post' });
    });

    it('remaps legacy user string filters to userId', () => {
      getModelMetaMock.mockReturnValue(
        makeModelMeta('id', 'organizationId', 'userId', 'isDeleted'),
      );

      const result = service.processSearchParams({
        status: 'active',
        user: 'user1',
      });

      expect(result).toEqual({ status: 'active', userId: 'user1' });
    });

    it('remaps legacy organization null filters to organizationId null', () => {
      getModelMetaMock.mockReturnValue(
        makeModelMeta('id', 'organizationId', 'isDeleted'),
      );

      const result = service.processSearchParams({
        organization: null,
        type: 'post',
      });

      expect(result).toEqual({ organizationId: null, type: 'post' });
    });

    it('drops a legacy relation filter when the model has neither the scalar FK nor the relation', () => {
      getModelMetaMock.mockReturnValue(
        makeModelMeta('id', 'organizationId', 'isDeleted'),
      );

      const result = service.processSearchParams({
        organization: null,
        user: null,
      });

      // organizationId mapped; user dropped (model has no userId / user field)
      expect(result).toEqual({ organizationId: null });
    });

    it('preserves organization relation filters when they are objects', () => {
      const result = service.processSearchParams({
        organization: { is: { id: 'org1' } },
      });
      expect(result).toEqual({
        organization: { is: { id: 'org1' } },
      });
    });

    it('preserves user relation filters when they are objects', () => {
      getModelMetaMock.mockReturnValue(
        makeModelMeta('id', 'organizationId', 'user', 'isDeleted'),
      );

      const result = service.processSearchParams({
        user: { is: { id: 'user1' } },
      });

      expect(result).toEqual({
        user: { is: { id: 'user1' } },
      });
    });

    it('remaps scalar operator objects on legacy relation aliases to scalar FK fields', () => {
      getModelMetaMock.mockReturnValue(
        makeModelMeta(
          'id',
          'isDeleted',
          'organizationId',
          'brandId',
          'folderId',
        ),
      );

      const result = service.processSearchParams({
        brand: { not: null },
        folder: { equals: 'folder1' },
        organization: { not: null },
      });

      expect(result).toEqual({
        brandId: { not: null },
        folderId: { equals: 'folder1' },
        organizationId: { not: null },
      });
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

    it('does not warn when all filter fields exist on the model', async () => {
      getModelMetaMock.mockReturnValue(
        makeModelMeta('id', 'organizationId', 'isDeleted'),
      );
      delegate.findMany.mockResolvedValue([]);
      delegate.count.mockResolvedValue(0);
      (logger.warn as ReturnType<typeof vi.fn>).mockClear();

      await service.findAll(
        { where: { organizationId: 'org1' } },
        { page: 1, limit: 10 },
      );

      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('drops isDeleted filters for models without soft-delete support', () => {
      getModelMetaMock.mockReturnValue(makeModelMeta('id', 'organizationId'));

      const result = service.processSearchParams({
        isDeleted: false,
        status: 'ok',
      });

      expect(result).toEqual({ status: 'ok' });
    });

    it('passes through other fields unchanged', () => {
      const result = service.processSearchParams({
        organizationId: 'org1',
        type: 'post',
      });
      expect(result).toEqual({ organizationId: 'org1', type: 'post' });
    });
  });

  describe('findAllByOrganization', () => {
    it('queries with organizationId and isDeleted filters', async () => {
      delegate.findMany.mockResolvedValue([]);

      await service.findAllByOrganization('org1');

      expect(delegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org1',
            isDeleted: false,
          }),
        }),
      );
    });

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

  describe('normalizeData — metadata→metadataId remap', () => {
    it('remaps metadata string to metadataId on create', async () => {
      const created = { id: 'ing_1', metadataId: 'meta_1' };
      delegate.create.mockResolvedValue(created);

      await service.create({ metadata: 'meta_1' } as TestDocument);

      expect(delegate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ metadataId: 'meta_1' }),
        }),
      );
      expect(delegate.create).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ metadata: 'meta_1' }),
        }),
      );
    });

    it('does not remap metadata when value is not a string', async () => {
      const created = { id: 'ing_2' };
      delegate.create.mockResolvedValue(created);

      // metadata as an object (e.g. populated relation) must pass through untouched
      await service.create({ metadata: { id: 'meta_1' } } as TestDocument);

      expect(delegate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ metadata: { id: 'meta_1' } }),
        }),
      );
    });

    it('leaves organization untouched on create (no tenancy side-effect)', async () => {
      const created = { id: 'ing_3', organizationId: 'org_1' };
      delegate.create.mockResolvedValue(created);

      await service.create({ organization: 'org_1' } as TestDocument);

      expect(delegate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ organization: 'org_1' }),
        }),
      );
    });

    it('remaps metadata string to metadataId on patch', async () => {
      getModelMetaMock.mockReturnValue(
        makeModelMeta('id', 'isDeleted', 'metadataId'),
      );
      const updated = { id: 'ing_4', metadataId: 'meta_2' };
      delegate.update.mockResolvedValue(updated);

      await service.patch('ing_4', { metadata: 'meta_2' } as TestDocument);

      expect(delegate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ metadataId: 'meta_2' }),
        }),
      );
      expect(delegate.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ metadata: 'meta_2' }),
        }),
      );
    });
  });
});
