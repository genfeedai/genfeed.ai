import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';
import { LoggerService } from '@libs/logger/logger.service';

// Mock @genfeedai/prisma before importing BaseService so the module resolves cleanly in test env
vi.mock('@genfeedai/prisma', () => ({ PrismaClient: class {} }));

import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';

describe('BaseService', () => {
  type TestDocument = Record<string, unknown>;

  class TestService extends BaseService<TestDocument> {}

  let service: TestService;
  let prisma: PrismaService;
  let delegate: Record<string, ReturnType<typeof vi.fn>>;
  let logger: LoggerService;
  let setModelFields: (...fields: string[]) => void;

  beforeEach(() => {
    logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as Partial<LoggerService> as LoggerService;

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

    // PrismaService with a dynamic delegate accessible via modelName key
    prisma = {
      _runtimeDataModel: {
        models: {
          TestModel: {
            fields: [],
          },
        },
      },
      testModel: delegate,
    } as unknown as PrismaService;

    service = new TestService(prisma, 'testModel', logger);
    setModelFields = (...fields: string[]) => {
      (
        prisma as PrismaService & {
          _runtimeDataModel: {
            models: {
              TestModel: {
                fields: Array<{ name: string }>;
              };
            };
          };
        }
      )._runtimeDataModel.models.TestModel.fields = fields.map((name) => ({
        name,
      }));
    };
    setModelFields('id', 'organizationId', 'isDeleted');
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
      expect(result).toEqual({ ...created, _id: 'id_1' });
    });

    it('creates a document with include when populate is provided', async () => {
      const created = { id: 'id_1', foo: 'bar', user: { id: 'u1' } };
      delegate.create.mockResolvedValue(created);

      const result = await service.create({ foo: 'bar' }, ['user']);

      expect(delegate.create).toHaveBeenCalledWith({
        data: { foo: 'bar' },
        include: { user: true },
      });
      expect(result).toEqual({ ...created, _id: 'id_1' });
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
      setModelFields('id', 'organizationId');
      delegate.findMany.mockResolvedValue([{ id: '1' }]);
      delegate.count.mockResolvedValue(1);

      await service.findAll({ where: {} }, { page: 1, limit: 10 });

      expect(delegate.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
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
        orderBy: { label: 'asc' },
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
      expect(result).toEqual({ ...doc, _id: 'id_1' });
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
      expect(result).toEqual({ ...updated, _id: 'id_1' });
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
        where: { status: 'old' },
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
      expect(result).toEqual({ ...deleted, _id: 'id_1' });
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
      setModelFields('id', 'mongoId', 'organizationId', 'isDeleted');

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
      setModelFields('id', 'organizationId', 'userId', 'isDeleted');

      const result = service.processSearchParams({
        status: 'active',
        user: 'user1',
      });

      expect(result).toEqual({ status: 'active', userId: 'user1' });
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
      setModelFields('id', 'organizationId', 'user', 'isDeleted');

      const result = service.processSearchParams({
        user: { is: { id: 'user1' } },
      });

      expect(result).toEqual({
        user: { is: { id: 'user1' } },
      });
    });

    it('drops isDeleted filters for models without soft-delete support', () => {
      setModelFields('id', 'organizationId');

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
      expect(result).toEqual({ _id: 'id_1', id: 'id_1', isRead: true });
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
});
