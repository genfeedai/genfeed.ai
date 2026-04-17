import { AvatarsService } from '@api/collections/avatars/services/avatars.service';
import { Ingredient } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
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

describe('AvatarsService', () => {
  let service: AvatarsService;
  let model: ReturnType<typeof createMockModel>;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(async () => {
    model = createMockModel({
      category: 'avatar',
      isDeleted: false,
      name: 'Test Avatar',
    });
    // IngredientsService.findOne uses aggregate().exec()
    model.aggregate = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue([]),
    });
    logger = createMockLogger();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvatarsService,
        {
          provide: getModelToken(Ingredient.name, DB_CONNECTIONS.CLOUD),
          useValue: model,
        },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    service = module.get<AvatarsService>(AvatarsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should be an instance of AvatarsService', () => {
    expect(service).toBeInstanceOf(AvatarsService);
  });

  it('should extend IngredientsService', () => {
    expect(service).toBeInstanceOf(IngredientsService);
  });

  it('should have a logger', () => {
    expect(service.logger).toBeDefined();
  });

  describe('findOne (inherited from IngredientsService)', () => {
    it('should return doc when aggregate pipeline finds one', async () => {
      const doc = { _id: new Types.ObjectId(), name: 'Avatar 1' };
      model.aggregate.mockReturnValue({
        exec: vi.fn().mockResolvedValue([doc]),
      });

      const result = await service.findOne({ _id: doc._id.toHexString() });
      expect(result).toEqual(doc);
      expect(model.aggregate).toHaveBeenCalled();
    });

    it('should return null when aggregate returns empty', async () => {
      model.aggregate.mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
      });

      const result = await service.findOne({
        _id: new Types.ObjectId().toHexString(),
      });
      expect(result).toBeNull();
    });
  });

  describe('remove (inherited from BaseService)', () => {
    it('should soft-delete by setting isDeleted: true', async () => {
      const id = new Types.ObjectId().toHexString();
      const deleted = { _id: id, isDeleted: true };
      model.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue(deleted),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.remove(id);
      expect(result).toEqual(deleted);
      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        id,
        { isDeleted: true },
        { returnDocument: 'after' },
      );
    });

    it('should return null when document not found for removal', async () => {
      model.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.remove(new Types.ObjectId().toHexString());
      expect(result).toBeNull();
    });
  });

  describe('processSearchParams (inherited)', () => {
    it('should convert _id string to ObjectId', () => {
      const id = new Types.ObjectId().toHexString();
      const result = service.processSearchParams({ _id: id });
      expect(result._id).toBeInstanceOf(Types.ObjectId);
    });

    it('should leave non-id fields untouched', () => {
      const result = service.processSearchParams({
        isDeleted: false,
        name: 'test',
      });
      expect(result.name).toBe('test');
      expect(result.isDeleted).toBe(false);
    });
  });
});
