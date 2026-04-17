import { Caption } from '@api/collections/captions/schemas/caption.schema';
import { CaptionsService } from '@api/collections/captions/services/captions.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { createMockModel } from '@api/shared/testing/mock-model.factory';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
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

describe('CaptionsService', () => {
  let service: CaptionsService;
  let model: ReturnType<typeof createMockModel>;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(async () => {
    model = createMockModel({
      content: 'Hello world',
      format: 'srt',
      isDeleted: false,
      language: 'en',
    });
    logger = createMockLogger();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CaptionsService,
        {
          provide: getModelToken(Caption.name, DB_CONNECTIONS.CLOUD),
          useValue: model,
        },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    service = module.get<CaptionsService>(CaptionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have constructorName set', () => {
    expect(service.constructorName).toBe('CaptionsService');
  });

  describe('findOne (inherited from BaseService)', () => {
    it('should find a caption by id', async () => {
      const doc = {
        _id: new Types.ObjectId(),
        content: 'Hello',
        format: 'srt',
      };
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(doc),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.findOne({
        _id: doc._id.toHexString(),
      });
      expect(result).toEqual(doc);
    });

    it('should return null when caption not found', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.findOne({
        _id: new Types.ObjectId().toHexString(),
      });
      expect(result).toBeNull();
    });

    it('should propagate errors from model.findOne', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockRejectedValue(new Error('DB error')),
        populate: vi.fn().mockReturnThis(),
      });

      await expect(
        service.findOne({ _id: new Types.ObjectId().toHexString() }),
      ).rejects.toThrow('DB error');
    });
  });

  describe('patch (inherited from BaseService)', () => {
    it('should update caption content', async () => {
      const id = new Types.ObjectId();
      const updated = { _id: id, content: 'Updated caption' };
      model.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue(updated),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.patch(id, { content: 'Updated caption' });
      expect(result).toEqual(updated);
      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        id,
        { $set: { content: 'Updated caption' } },
        { returnDocument: 'after' },
      );
    });
  });

  describe('remove (inherited from BaseService)', () => {
    it('should soft-delete a caption', async () => {
      const id = new Types.ObjectId().toHexString();
      const deleted = { _id: id, isDeleted: true };
      model.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue(deleted),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.remove(id);
      expect(result).toEqual(deleted);
    });

    it('should return null when caption not found for removal', async () => {
      model.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.remove(new Types.ObjectId().toHexString());
      expect(result).toBeNull();
    });
  });

  describe('create (inherited from BaseService)', () => {
    it('should create a new caption', async () => {
      const result = await service.create({
        content: 'New caption',
        format: 'vtt',
        language: 'en',
      } as Record<string, unknown>);
      expect(result).toBeDefined();
      expect(result).toHaveProperty('_id');
    });
  });

  describe('findAll (inherited from BaseService)', () => {
    it('should return paginated results', async () => {
      const docs = [
        { _id: new Types.ObjectId(), content: 'Caption 1' },
        { _id: new Types.ObjectId(), content: 'Caption 2' },
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

      const result = await service.findAll([{ $match: { isDeleted: false } }], {
        limit: 10,
        page: 1,
      });

      expect(result.docs).toEqual(docs);
      expect(result.totalDocs).toBe(2);
    });
  });
});
