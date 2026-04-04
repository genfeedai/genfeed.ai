import { CaptionsController } from '@api/collections/captions/controllers/captions.controller';
import { CaptionsService } from '@api/collections/captions/services/captions.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { WhisperService } from '@api/services/whisper/whisper.service';
import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMockDeps() {
  return {
    captionsService: {
      create: vi.fn(),
      findAll: vi.fn(),
      findOne: vi.fn(),
      patch: vi.fn(),
      remove: vi.fn(),
    },
    ingredientsService: {
      findOne: vi.fn(),
    },
    logger: {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    },
    whisperService: {
      generateCaptions: vi.fn(),
    },
  };
}

function createMockUser(userId: string) {
  return {
    publicMetadata: {
      brand: new Types.ObjectId().toHexString(),
      isSuperAdmin: false,
      organization: new Types.ObjectId().toHexString(),
      user: userId,
    },
  } as never;
}

function createMockRequest(): Request {
  return {
    baseUrl: '/api/captions',
    get: vi.fn().mockReturnValue('localhost'),
    originalUrl: '/api/captions',
    protocol: 'https',
  } as unknown as Request;
}

describe('CaptionsController', () => {
  let controller: CaptionsController;
  let deps: ReturnType<typeof createMockDeps>;

  beforeEach(async () => {
    deps = createMockDeps();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CaptionsController],
      providers: [
        { provide: CaptionsService, useValue: deps.captionsService },
        { provide: IngredientsService, useValue: deps.ingredientsService },
        { provide: WhisperService, useValue: deps.whisperService },
        { provide: LoggerService, useValue: deps.logger },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CaptionsController>(CaptionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findOne', () => {
    it('should return serialized caption when found', async () => {
      const captionId = new Types.ObjectId().toHexString();
      const doc = {
        _id: captionId,
        content: 'Hello',
        format: 'srt',
        toJSON: () => ({ _id: captionId, content: 'Hello', format: 'srt' }),
      };
      deps.captionsService.findOne.mockResolvedValue(doc);

      const result = await controller.findOne(createMockRequest(), captionId);
      expect(result).toBeDefined();
      expect(deps.captionsService.findOne).toHaveBeenCalledWith(
        { _id: captionId },
        expect.any(Array),
      );
    });

    it('should throw HttpException 404 when caption not found', async () => {
      deps.captionsService.findOne.mockResolvedValue(null);

      await expect(
        controller.findOne(createMockRequest(), 'nonexistent'),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('create', () => {
    it('should throw 404 when ingredient not found', async () => {
      deps.ingredientsService.findOne.mockResolvedValue(null);
      const userId = new Types.ObjectId().toHexString();
      const ingredientId = new Types.ObjectId();

      await expect(
        controller.create(
          createMockRequest(),
          { format: 'srt', ingredient: ingredientId, language: 'en' } as never,
          createMockUser(userId),
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should throw BadRequestException for non-video ingredient', async () => {
      const ingredientId = new Types.ObjectId();
      deps.ingredientsService.findOne.mockResolvedValue({
        _id: ingredientId,
        category: IngredientCategory.IMAGE,
        status: IngredientStatus.GENERATED,
      });

      const userId = new Types.ObjectId().toHexString();

      await expect(
        controller.create(
          createMockRequest(),
          { format: 'srt', ingredient: ingredientId, language: 'en' } as never,
          createMockUser(userId),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when video status is not ready', async () => {
      const ingredientId = new Types.ObjectId();
      deps.ingredientsService.findOne.mockResolvedValue({
        _id: ingredientId,
        category: IngredientCategory.VIDEO,
        status: IngredientStatus.GENERATING,
      });

      const userId = new Types.ObjectId().toHexString();

      await expect(
        controller.create(
          createMockRequest(),
          { format: 'srt', ingredient: ingredientId, language: 'en' } as never,
          createMockUser(userId),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should generate captions and create caption document for valid video', async () => {
      const ingredientId = new Types.ObjectId();
      const userId = new Types.ObjectId().toHexString();
      const captionContent = '1\n00:00:00,000 --> 00:00:05,000\nHello';

      deps.ingredientsService.findOne.mockResolvedValue({
        _id: ingredientId,
        category: IngredientCategory.VIDEO,
        status: IngredientStatus.GENERATED,
      });
      deps.whisperService.generateCaptions.mockResolvedValue(captionContent);

      const createdDoc = {
        _id: new Types.ObjectId(),
        content: captionContent,
        format: 'srt',
        language: 'en',
        toJSON: () => ({
          _id: new Types.ObjectId().toHexString(),
          content: captionContent,
        }),
      };
      deps.captionsService.create.mockResolvedValue(createdDoc);

      const result = await controller.create(
        createMockRequest(),
        { format: 'srt', ingredient: ingredientId, language: 'en' } as never,
        createMockUser(userId),
      );

      expect(result).toBeDefined();
      expect(deps.whisperService.generateCaptions).toHaveBeenCalledWith(
        ingredientId.toString(),
      );
      expect(deps.captionsService.create).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should return serialized caption on successful update', async () => {
      const captionId = new Types.ObjectId().toHexString();
      const updated = {
        _id: captionId,
        content: 'Updated',
        toJSON: () => ({ _id: captionId, content: 'Updated' }),
      };
      deps.captionsService.patch.mockResolvedValue(updated);

      const result = await controller.update(createMockRequest(), captionId, {
        content: 'Updated',
      } as never);
      expect(result).toBeDefined();
    });

    it('should throw 404 when caption to update not found', async () => {
      deps.captionsService.patch.mockResolvedValue(null);

      await expect(
        controller.update(createMockRequest(), 'nonexistent', {
          content: 'Updated',
        } as never),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('remove', () => {
    it('should return serialized caption on successful removal', async () => {
      const captionId = new Types.ObjectId().toHexString();
      const deleted = {
        _id: captionId,
        isDeleted: true,
        toJSON: () => ({ _id: captionId, isDeleted: true }),
      };
      deps.captionsService.remove.mockResolvedValue(deleted);

      const result = await controller.remove(createMockRequest(), captionId);
      expect(result).toBeDefined();
    });

    it('should throw 404 when caption to remove not found', async () => {
      deps.captionsService.remove.mockResolvedValue(null);

      await expect(
        controller.remove(createMockRequest(), 'nonexistent'),
      ).rejects.toThrow(HttpException);
    });
  });
});
