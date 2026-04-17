import { VoicesService } from '@api/collections/voices/services/voices.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { createMockModel } from '@api/shared/testing/mock-model.factory';
import { type Ingredient } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMockLogger() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
}

describe('VoicesService', () => {
  let service: VoicesService;
  let model: ReturnType<typeof createMockModel>;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(async () => {
    model = createMockModel({
      category: 'voice',
      isDeleted: false,
      type: 'voice',
    });
    logger = createMockLogger();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VoicesService,
        { provide: PrismaService, useValue: model },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    service = module.get<VoicesService>(VoicesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have a logger', () => {
    expect(service.logger).toBeDefined();
  });

  describe('create (inherited from IngredientsService)', () => {
    it('should create a new voice ingredient', async () => {
      const savedDoc = {
        _id: 'test-object-id',
        category: 'voice',
        type: 'voice',
      };
      // IngredientsService.create calls super.create with populate, which does findById after save
      model.findById.mockReturnValue({
        exec: vi.fn().mockResolvedValue(savedDoc),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.create({
        category: 'voice',
        label: 'Test Voice',
        type: 'voice',
      } as Record<string, unknown>);
      expect(result).toBeDefined();
      expect(result).toHaveProperty('_id');
    });

    it('should throw when createDto is null', async () => {
      await expect(
        service.create(null as unknown as Record<string, unknown>),
      ).rejects.toThrow();
    });
  });

  describe('findOne (overridden in IngredientsService)', () => {
    it('should find a voice by id using aggregation', async () => {
      const doc = {
        _id: 'test-object-id',
        category: 'voice',
        type: 'voice',
      };
      model.aggregate.mockReturnValue({
        exec: vi.fn().mockResolvedValue([doc]),
      });

      const result = await service.findOne({ _id: doc._id });
      expect(result).toEqual(doc);
      expect(model.aggregate).toHaveBeenCalled();
    });

    it('should return null when voice not found', async () => {
      model.aggregate.mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
      });

      const result = await service.findOne({
        _id: 'test-object-id',
      });
      expect(result).toBeNull();
    });

    it('should populate when populate options are provided', async () => {
      const doc = {
        _id: 'test-object-id',
        category: 'voice',
        type: 'voice',
      };
      model.aggregate.mockReturnValue({
        exec: vi.fn().mockResolvedValue([doc]),
      });
      model.populate = vi.fn().mockResolvedValue(doc);

      const result = await service.findOne({ _id: doc._id }, [
        { path: 'metadata' },
      ]);
      expect(result).toEqual(doc);
      expect(model.populate).toHaveBeenCalled();
    });

    it('should propagate database errors', async () => {
      model.aggregate.mockReturnValue({
        exec: vi.fn().mockRejectedValue(new Error('Connection lost')),
      });

      await expect(service.findOne({ _id: 'test-object-id' })).rejects.toThrow(
        'Connection lost',
      );
    });
  });

  describe('patch (overridden in IngredientsService)', () => {
    it('should update a voice document', async () => {
      const id = 'test-object-id';
      const updated = { _id: id, status: 'validated' };
      model.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue(updated),
        populate: vi.fn().mockReturnThis(),
      });
      // findOne re-fetch after patch
      model.aggregate.mockReturnValue({
        exec: vi.fn().mockResolvedValue([updated]),
      });

      const result = await service.patch(id, {
        status: 'validated',
      });
      expect(result).toEqual(updated);
    });
  });

  describe('remove (inherited from BaseService)', () => {
    it('should soft-delete a voice', async () => {
      const id = 'test-object-id';
      const deleted = { _id: id, isDeleted: true };
      model.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue(deleted),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.remove(id);
      expect(result).toEqual(deleted);
    });

    it('should return null when voice not found for removal', async () => {
      model.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.remove('test-object-id');
      expect(result).toBeNull();
    });
  });

  describe('findAll (overridden in IngredientsService)', () => {
    it('should return paginated voice results with model lookup', async () => {
      const docs = [
        { _id: 'test-object-id', category: 'voice', type: 'voice' },
      ];
      model.aggregatePaginate.mockResolvedValue({
        docs,
        hasNextPage: false,
        hasPrevPage: false,
        limit: 10,
        page: 1,
        totalDocs: 1,
        totalPages: 1,
      });
      model.aggregate.mockReturnValue({});

      const result = await service.findAll(
        [{ $match: { isDeleted: false, type: 'voice' } }],
        { limit: 10, page: 1 },
      );

      expect(result.docs).toEqual(docs);
      expect(result.totalDocs).toBe(1);
    });
  });
});
