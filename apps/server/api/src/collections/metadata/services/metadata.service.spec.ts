import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { createMockModel } from '@api/shared/testing/mock-model.factory';
import { type Metadata } from '@genfeedai/prisma';
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

describe('MetadataService', () => {
  let service: MetadataService;
  let model: ReturnType<typeof createMockModel>;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(async () => {
    model = createMockModel({ isDeleted: false, result: 'test' });
    logger = createMockLogger();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetadataService,
        { provide: PrismaService, useValue: model },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    service = module.get<MetadataService>(MetadataService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOne (inherited from BaseService)', () => {
    it('should call model.findOne with processed params', async () => {
      const id = 'test-object-id'.toHexString();
      await service.findOne({ _id: id, isDeleted: false });

      expect(model.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: expect.any(string),
          isDeleted: false,
        }),
      );
    });

    it('should return null when document not found', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.findOne({ _id: 'nonexistent' });
      expect(result).toBeNull();
    });

    it('should return doc when found', async () => {
      const doc = {
        _id: 'test-object-id',
        result: 'https://cdn.test.com/file.mp4',
      };
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(doc),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.findOne({ _id: doc._id.toHexString() });
      expect(result).toEqual(doc);
    });
  });

  describe('patch (inherited from BaseService)', () => {
    it('should call findByIdAndUpdate with $set wrapper', async () => {
      const id = 'test-object-id';
      const doc = { _id: id, result: 'updated' };
      model.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue(doc),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.patch(id, { result: 'updated' });
      expect(result).toEqual(doc);
      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        id,
        { $set: { result: 'updated' } },
        { returnDocument: 'after' },
      );
    });

    it('should pass $set/$unset directly without re-wrapping', async () => {
      const id = 'test-object-id';
      model.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue({}),
        populate: vi.fn().mockReturnThis(),
      });

      await service.patch(id, {
        $set: { result: 'new' },
        $unset: { error: '' },
      });

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        id,
        { $set: { result: 'new' }, $unset: { error: '' } },
        { returnDocument: 'after' },
      );
    });
  });

  describe('create (inherited from BaseService)', () => {
    it('should create a document via the model constructor and save', async () => {
      // createMockModel returns a constructor function that produces objects with save()
      // The default save() mock already resolves to a doc with _id
      const result = await service.create({ result: 'created' } as Record<
        string,
        unknown
      >);
      expect(result).toBeDefined();
      expect(result).toHaveProperty('_id');
    });
  });

  describe('processSearchParams', () => {
    it('should convert string _id to ObjectId', () => {
      const id = 'test-object-id'.toHexString();
      const result = service.processSearchParams({ _id: id });
      expect(result._id).toBeInstanceOf(string);
    });

    it('should not convert non-ObjectId fields', () => {
      const result = service.processSearchParams({
        isDeleted: false,
        result: 'some-string',
      });
      expect(result.result).toBe('some-string');
      expect(result.isDeleted).toBe(false);
    });

    it('should convert metadata field to ObjectId', () => {
      const id = 'test-object-id'.toHexString();
      const result = service.processSearchParams({ metadata: id });
      expect(result.metadata).toBeInstanceOf(string);
    });
  });
});
