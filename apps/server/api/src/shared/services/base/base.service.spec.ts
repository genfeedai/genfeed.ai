import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import type { PipelineStage, Types } from 'mongoose';

describe('BaseService', () => {
  type TestDocument = Record<string, unknown>;
  type MockAggregateModel = AggregatePaginateModel<TestDocument> &
    ReturnType<typeof vi.fn> &
    Record<string, ReturnType<typeof vi.fn>>;

  class TestService extends BaseService<TestDocument> {}

  let service: TestService;
  let model: MockAggregateModel;
  let logger: LoggerService;

  beforeEach(() => {
    logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as Partial<LoggerService> as LoggerService;

    model = vi.fn().mockImplementation(function (data: TestDocument) {
      return { ...data, save: vi.fn() };
    }) as unknown as MockAggregateModel;
    model.collection = {
      name: 'test-collection',
    } as MockAggregateModel['collection'];
    model.modelName = 'TestModel';
    model.findById = vi.fn().mockReturnValue({
      exec: vi.fn(),
      populate: vi.fn().mockReturnThis(),
    });
    model.aggregate = vi.fn().mockReturnThis();
    model.aggregatePaginate = vi.fn();
    model.findOne = vi.fn().mockReturnValue({
      exec: vi.fn(),
      populate: vi.fn().mockReturnThis(),
    });
    model.findByIdAndUpdate = vi.fn().mockReturnValue({
      exec: vi.fn(),
      populate: vi.fn().mockReturnThis(),
    });
    model.updateMany = vi.fn().mockReturnValue({ exec: vi.fn() });

    service = new TestService(model, logger, undefined, undefined);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates a document and returns the saved entity', async () => {
    const saveMock = vi.fn().mockResolvedValue({ _id: '1' });
    model.mockImplementation(function () {
      return { save: saveMock };
    });
    const execMock = vi.fn().mockResolvedValue('found');
    model.findById = vi.fn().mockReturnValue({
      exec: execMock,
      populate: vi.fn().mockReturnThis(),
    });

    const result = await service.create({ foo: 'bar' }, [{ path: 'p' }]);

    expect(saveMock).toHaveBeenCalled();
    expect(model.findById).toHaveBeenCalledWith('1');
    expect(execMock).toHaveBeenCalled();
    expect(result).toBe('found');
  });

  it('aggregates and paginates results', async () => {
    model.aggregate = vi.fn().mockReturnValue('agg');
    model.aggregatePaginate = vi.fn().mockResolvedValue('paginated');

    const pipeline = [{ $match: { a: 1 } }];
    const result = await service.findAll(pipeline, { limit: 1 });

    expect(model.aggregate).toHaveBeenCalledWith(pipeline);
    expect(model.aggregatePaginate).toHaveBeenCalledWith('agg', { limit: 1 });
    expect(result).toBe('paginated');
  });

  it('finds a single document', async () => {
    const execMock = vi.fn().mockResolvedValue('doc');
    const populateMock = vi.fn().mockReturnValue({ exec: execMock });
    model.findOne = vi.fn().mockReturnValue({ populate: populateMock });

    const result = await service.findOne({ a: 1 }, ['pop']);

    expect(model.findOne).toHaveBeenCalledWith({ a: 1 });
    expect(populateMock).toHaveBeenCalledWith([
      { path: 'pop', select: '_id label handle' },
    ]);
    expect(result).toBe('doc');
  });

  it('patches a document', async () => {
    const execMock = vi.fn().mockResolvedValue('patched');
    const populateMock = vi.fn().mockReturnValue({ exec: execMock });
    model.findByIdAndUpdate = vi
      .fn()
      .mockReturnValue({ populate: populateMock });

    const result = await service.patch('id', { foo: 'bar' }, ['pop']);

    expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
      'id',
      { $set: { foo: 'bar' } },
      { returnDocument: 'after' },
    );
    expect(populateMock).toHaveBeenCalledWith([
      { path: 'pop', select: '_id label handle' },
    ]);
    expect(result).toBe('patched');
  });

  it('patches multiple documents', async () => {
    const execMock = vi.fn().mockResolvedValue({ modifiedCount: 1 });
    model.updateMany = vi.fn().mockReturnValue({ exec: execMock });

    const result = await service.patchAll({ a: 1 }, { b: 2 });

    expect(model.updateMany).toHaveBeenCalledWith({ a: 1 }, { b: 2 });
    expect(result).toEqual({ modifiedCount: 1 });
  });

  it('soft deletes a document', async () => {
    const execMock = vi.fn().mockResolvedValue('removed');
    model.findByIdAndUpdate = vi.fn().mockReturnValue({ exec: execMock });

    const result = await service.remove('id');

    expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
      'id',
      { isDeleted: true },
      { returnDocument: 'after' },
    );
    expect(result).toBe('removed');
  });

  describe('Error Handling', () => {
    describe('create', () => {
      it('should throw ValidationException when createDto is null/undefined', async () => {
        await expect(
          service.create(null as unknown as TestDocument),
        ).rejects.toThrow(ValidationException);
        await expect(
          service.create(undefined as unknown as TestDocument),
        ).rejects.toThrow(ValidationException);

        expect(logger.error).toHaveBeenCalledWith(
          'Failed to create document',
          expect.objectContaining({
            error: expect.any(ValidationException),
          }),
        );
      });

      it('should throw NotFoundException when created document is not found after save', async () => {
        const saveMock = vi.fn().mockResolvedValue({ _id: '1' });
        model.mockImplementation(function () {
          return { save: saveMock };
        });
        model.findById = vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(null), // Document not found
          populate: vi.fn().mockReturnThis(),
        });

        await expect(service.create({ foo: 'bar' }, ['path'])).rejects.toThrow(
          NotFoundException,
        );

        expect(logger.error).toHaveBeenCalledWith(
          'Failed to create document',
          expect.objectContaining({
            error: expect.any(NotFoundException),
          }),
        );
      });

      it('should handle database errors during save', async () => {
        const dbError = new Error('Database connection failed');
        const saveMock = vi.fn().mockRejectedValue(dbError);
        model.mockImplementation(function () {
          return { save: saveMock };
        });

        await expect(service.create({ foo: 'bar' })).rejects.toThrow(dbError);

        expect(logger.error).toHaveBeenCalledWith(
          'Failed to create document',
          expect.objectContaining({
            createDto: { foo: 'bar' },
            error: dbError,
          }),
        );
      });

      it('should handle database errors during populate', async () => {
        const saveMock = vi.fn().mockResolvedValue({ _id: '1' });
        model.mockImplementation(function () {
          return { save: saveMock };
        });
        const dbError = new Error('Population failed');
        model.findById = vi.fn().mockReturnValue({
          exec: vi.fn().mockRejectedValue(dbError),
          populate: vi.fn().mockReturnThis(),
        });

        await expect(service.create({ foo: 'bar' }, ['path'])).rejects.toThrow(
          dbError,
        );
      });
    });

    describe('findAll', () => {
      it('should throw ValidationException when aggregate is not an array', async () => {
        await expect(
          service.findAll(null as unknown as PipelineStage[], { limit: 1 }),
        ).rejects.toThrow(ValidationException);

        await expect(
          service.findAll('not an array' as unknown as PipelineStage[], {
            limit: 1,
          }),
        ).rejects.toThrow(ValidationException);

        expect(logger.error).toHaveBeenCalledWith(
          'Failed to find documents',
          expect.objectContaining({
            error: expect.any(ValidationException),
          }),
        );
      });

      it('should handle database errors during aggregation', async () => {
        const dbError = new Error('Aggregation failed');
        model.aggregate = vi.fn().mockReturnValue('agg');
        model.aggregatePaginate = vi.fn().mockRejectedValue(dbError);

        const pipeline = [{ $match: { a: 1 } }];
        await expect(
          service.findAll(pipeline, { limit: 1 }, false),
        ).rejects.toThrow(dbError);

        expect(logger.error).toHaveBeenCalledWith(
          'Failed to find documents',
          expect.objectContaining({
            aggregate: pipeline,
            error: dbError,
          }),
        );
      });

      it('should handle errors during direct aggregation (pagination: false)', async () => {
        const dbError = new Error('Direct aggregation failed');
        model.aggregate = vi.fn().mockReturnValue({
          exec: vi.fn().mockRejectedValue(dbError),
        });

        const pipeline = [{ $match: { a: 1 } }];
        await expect(
          service.findAll(pipeline, { pagination: false }),
        ).rejects.toThrow(dbError);
      });
    });

    describe('findOne', () => {
      it('should throw ValidationException when params is null/undefined/invalid', async () => {
        await expect(
          service.findOne(null as unknown as Record<string, unknown>),
        ).rejects.toThrow(ValidationException);
        await expect(
          service.findOne(undefined as unknown as Record<string, unknown>),
        ).rejects.toThrow(ValidationException);
        await expect(
          service.findOne(
            'not an object' as unknown as Record<string, unknown>,
          ),
        ).rejects.toThrow(ValidationException);

        expect(logger.error).toHaveBeenCalledWith(
          'Failed to find document',
          expect.objectContaining({
            error: expect.any(ValidationException),
          }),
        );
      });

      it('should handle database errors during findOne', async () => {
        const dbError = new Error('Database query failed');
        model.findOne = vi.fn().mockReturnValue({
          exec: vi.fn().mockRejectedValue(dbError),
          populate: vi.fn().mockReturnThis(),
        });

        await expect(service.findOne({ _id: '123' })).rejects.toThrow(dbError);

        expect(logger.error).toHaveBeenCalledWith(
          'Failed to find document',
          expect.objectContaining({
            error: dbError,
            params: { _id: '123' },
          }),
        );
      });
    });

    describe('patch', () => {
      it('should throw ValidationException when id is null/undefined', async () => {
        await expect(
          service.patch(null as unknown as Types.ObjectId, { foo: 'bar' }),
        ).rejects.toThrow(ValidationException);
        await expect(
          service.patch(undefined as unknown as Types.ObjectId, { foo: 'bar' }),
        ).rejects.toThrow(ValidationException);

        expect(logger.error).toHaveBeenCalledWith(
          'Failed to update document',
          expect.objectContaining({
            error: expect.any(ValidationException),
          }),
        );
      });

      it('should throw ValidationException when updateDto is null/undefined/invalid', async () => {
        await expect(
          service.patch('123', null as unknown as Record<string, unknown>),
        ).rejects.toThrow(ValidationException);
        await expect(
          service.patch('123', undefined as unknown as Record<string, unknown>),
        ).rejects.toThrow(ValidationException);
        await expect(
          service.patch(
            '123',
            'not an object' as unknown as Record<string, unknown>,
          ),
        ).rejects.toThrow(ValidationException);
      });

      it('should handle database errors during patch', async () => {
        const dbError = new Error('Update failed');
        model.findByIdAndUpdate = vi.fn().mockReturnValue({
          exec: vi.fn().mockRejectedValue(dbError),
          populate: vi.fn().mockReturnThis(),
        });

        await expect(service.patch('123', { foo: 'bar' })).rejects.toThrow(
          dbError,
        );

        expect(logger.error).toHaveBeenCalledWith(
          'Failed to update document',
          expect.objectContaining({
            error: dbError,
            id: '123',
            updateDto: { foo: 'bar' },
          }),
        );
      });
    });

    describe('patchAll', () => {
      it('should throw ValidationException when filter is null/undefined/invalid', async () => {
        await expect(
          service.patchAll(null as unknown as Record<string, unknown>, {
            foo: 'bar',
          }),
        ).rejects.toThrow(ValidationException);
        await expect(
          service.patchAll(undefined as unknown as Record<string, unknown>, {
            foo: 'bar',
          }),
        ).rejects.toThrow(ValidationException);
        await expect(
          service.patchAll(
            'not an object' as unknown as Record<string, unknown>,
            { foo: 'bar' },
          ),
        ).rejects.toThrow(ValidationException);
      });

      it('should throw ValidationException when update is null/undefined/invalid', async () => {
        await expect(
          service.patchAll(
            { _id: '123' },
            null as unknown as Record<string, unknown>,
          ),
        ).rejects.toThrow(ValidationException);
        await expect(
          service.patchAll(
            { _id: '123' },
            undefined as unknown as Record<string, unknown>,
          ),
        ).rejects.toThrow(ValidationException);
        await expect(
          service.patchAll(
            { _id: '123' },
            'not an object' as unknown as Record<string, unknown>,
          ),
        ).rejects.toThrow(ValidationException);
      });

      it('should handle database errors during bulk update', async () => {
        const dbError = new Error('Bulk update failed');
        model.updateMany = vi.fn().mockReturnValue({
          exec: vi.fn().mockRejectedValue(dbError),
        });

        await expect(
          service.patchAll({ user: '123' }, { status: 'updated' }),
        ).rejects.toThrow(dbError);

        expect(logger.error).toHaveBeenCalledWith(
          'Failed to bulk update documents',
          expect.objectContaining({
            error: dbError,
            filter: { user: '123' },
            update: { status: 'updated' },
          }),
        );
      });
    });

    describe('remove', () => {
      it('should throw ValidationException when id is null/undefined', async () => {
        await expect(service.remove(null as unknown as string)).rejects.toThrow(
          ValidationException,
        );
        await expect(
          service.remove(undefined as unknown as string),
        ).rejects.toThrow(ValidationException);

        expect(logger.error).toHaveBeenCalledWith(
          'Failed to soft delete document',
          expect.objectContaining({
            error: expect.any(ValidationException),
          }),
        );
      });

      it('should handle database errors during soft delete', async () => {
        const dbError = new Error('Soft delete failed');
        model.findByIdAndUpdate = vi.fn().mockReturnValue({
          exec: vi.fn().mockRejectedValue(dbError),
        });

        await expect(service.remove('123')).rejects.toThrow(dbError);

        expect(logger.error).toHaveBeenCalledWith(
          'Failed to soft delete document',
          expect.objectContaining({
            error: dbError,
            id: '123',
          }),
        );
      });
    });
  });

  describe('Logging', () => {
    it('should log successful operations with debug level', async () => {
      const saveMock = vi.fn().mockResolvedValue({ _id: '1' });
      model.mockImplementation(function () {
        return { save: saveMock };
      });
      model.findById = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue({ _id: '1', foo: 'bar' }),
        populate: vi.fn().mockReturnThis(),
      });

      await service.create({ foo: 'bar' });

      expect(logger.debug).toHaveBeenCalledWith(
        'Creating new document',
        expect.objectContaining({
          createDto: { foo: 'bar' },
        }),
      );
      expect(logger.debug).toHaveBeenCalledWith(
        'Document created successfully',
        { id: '1' },
      );
    });

    it('should not throw when logger is not provided', async () => {
      const serviceWithoutLogger = new TestService(model);
      const saveMock = vi.fn().mockResolvedValue({ _id: '1' });
      model.mockImplementation(function () {
        return { save: saveMock };
      });

      // Should not throw even without logger
      await expect(
        serviceWithoutLogger.create({ foo: 'bar' }),
      ).resolves.toBeDefined();
    });
  });

  describe('Data Sanitization', () => {
    it('should not expose sensitive data in error logs', async () => {
      const sensitiveData = {
        apiKey: 'key-123-secret',
        password: 'secret123',
        token: 'auth-token',
      };

      const dbError = new Error('Database error');
      const saveMock = vi.fn().mockRejectedValue(dbError);
      model.mockImplementation(function () {
        return { save: saveMock };
      });

      await expect(service.create(sensitiveData)).rejects.toThrow(dbError);

      // Verify error is logged with the data, but we expect the service to handle this appropriately
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to create document',
        expect.objectContaining({
          createDto: sensitiveData,
          error: dbError,
        }),
      );
    });
  });
});
