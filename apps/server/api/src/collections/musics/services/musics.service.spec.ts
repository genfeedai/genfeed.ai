import { Ingredient } from '@api/collections/ingredients/schemas/ingredient.schema';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { createMockModel } from '@api/shared/testing/mock-model.factory';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMockLogger() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
}

describe('MusicsService', () => {
  let service: MusicsService;
  let model: ReturnType<typeof createMockModel>;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(async () => {
    model = createMockModel({
      category: 'music',
      isDeleted: false,
      status: 'generated',
    });
    logger = createMockLogger();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MusicsService,
        {
          provide: getModelToken(Ingredient.name, DB_CONNECTIONS.CLOUD),
          useValue: model,
        },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    service = module.get<MusicsService>(MusicsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have a logger', () => {
    expect(service.logger).toBeDefined();
  });

  describe('create (inherited from BaseService)', () => {
    it('should create a new music document', async () => {
      const result = await service.create({
        category: 'music',
        label: 'Test Track',
        status: 'generated',
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

  describe('findOne (inherited from BaseService)', () => {
    it('should find a music by id', async () => {
      const doc = {
        _id: new Types.ObjectId(),
        category: 'music',
        status: 'generated',
      };
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(doc),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.findOne({ _id: doc._id.toHexString() });
      expect(result).toEqual(doc);
    });

    it('should return null when music not found', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.findOne({
        _id: new Types.ObjectId().toHexString(),
      });
      expect(result).toBeNull();
    });

    it('should propagate database errors', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockRejectedValue(new Error('Connection lost')),
        populate: vi.fn().mockReturnThis(),
      });

      await expect(
        service.findOne({ _id: new Types.ObjectId().toHexString() }),
      ).rejects.toThrow('Connection lost');
    });
  });

  describe('patch (inherited from BaseService)', () => {
    it('should update a music document', async () => {
      const id = new Types.ObjectId();
      const updated = { _id: id, status: 'validated' };
      model.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue(updated),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.patch(id, { status: 'validated' });
      expect(result).toEqual(updated);
      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        id,
        { $set: { status: 'validated' } },
        { returnDocument: 'after' },
      );
    });
  });

  describe('remove (inherited from BaseService)', () => {
    it('should soft-delete a music document', async () => {
      const id = new Types.ObjectId().toHexString();
      const deleted = { _id: id, isDeleted: true };
      model.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue(deleted),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.remove(id);
      expect(result).toEqual(deleted);
    });

    it('should return null when music not found for removal', async () => {
      model.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.remove(new Types.ObjectId().toHexString());
      expect(result).toBeNull();
    });
  });

  describe('findAll (inherited from BaseService)', () => {
    it('should return paginated music results', async () => {
      const docs = [
        { _id: new Types.ObjectId(), category: 'music', status: 'generated' },
        { _id: new Types.ObjectId(), category: 'music', status: 'validated' },
      ];
      model.aggregatePaginate.mockResolvedValue({
        docs,
        hasNextPage: false,
        hasPrevPage: false,
        limit: 10,
        page: 1,
        totalDocs: 2,
        totalPages: 1,
      });
      model.aggregate.mockReturnValue({});

      const result = await service.findAll(
        [{ $match: { category: 'music', isDeleted: false } }],
        { limit: 10, page: 1 },
      );

      expect(result.docs).toEqual(docs);
      expect(result.totalDocs).toBe(2);
    });
  });
});
