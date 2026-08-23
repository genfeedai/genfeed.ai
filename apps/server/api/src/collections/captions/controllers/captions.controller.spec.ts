import { CaptionsController } from '@api/collections/captions/controllers/captions.controller';
import { CaptionsService } from '@api/collections/captions/services/captions.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { WhisperService } from '@api/services/whisper/whisper.service';
import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const organizationId = testId('org');

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
    brandId: testId('brand'),
    isSuperAdmin: false,
    organizationId,
    userId: userId,
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

  describe('findAll', () => {
    it('should scope captions by canonical organization and user IDs', async () => {
      const userId = testId('user', 2);
      deps.captionsService.findAll.mockResolvedValue({ docs: [] });

      await controller.findAll(
        createMockRequest(),
        createMockUser(userId),
        {} as never,
      );

      expect(deps.captionsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId,
            userId,
          }),
        }),
        expect.anything(),
      );
    });
  });

  describe('findOne', () => {
    it('should return serialized caption when found', async () => {
      const captionId = testId('caption');
      const doc = {
        id: captionId,
        content: 'Hello',
        format: 'srt',
        toJSON: () => ({ id: captionId, content: 'Hello', format: 'srt' }),
      };
      deps.captionsService.findOne.mockResolvedValue(doc);

      const result = await controller.findOne(createMockRequest(), captionId);
      expect(result).toBeDefined();
      expect(deps.captionsService.findOne).toHaveBeenCalledWith(
        { id: captionId },
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
      const userId = testId('user');
      const ingredientId = testId('ingredient');

      await expect(
        controller.create(
          createMockRequest(),
          { format: 'srt', ingredientId, language: 'en' } as never,
          createMockUser(userId),
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should throw BadRequestException for non-video ingredient', async () => {
      const ingredientId = testId('ingredient');
      deps.ingredientsService.findOne.mockResolvedValue({
        id: ingredientId,
        category: IngredientCategory.IMAGE,
        status: IngredientStatus.GENERATED,
      });

      const userId = testId('user');

      await expect(
        controller.create(
          createMockRequest(),
          { format: 'srt', ingredientId, language: 'en' } as never,
          createMockUser(userId),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when video status is not ready', async () => {
      const ingredientId = testId('ingredient');
      deps.ingredientsService.findOne.mockResolvedValue({
        id: ingredientId,
        category: IngredientCategory.VIDEO,
        status: IngredientStatus.GENERATING,
      });

      const userId = testId('user');

      await expect(
        controller.create(
          createMockRequest(),
          { format: 'srt', ingredientId, language: 'en' } as never,
          createMockUser(userId),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should generate captions and create caption document for valid video', async () => {
      const ingredientId = testId('ingredient');
      const userId = testId('user');
      const captionContent = '1\n00:00:00,000 --> 00:00:05,000\nHello';

      deps.ingredientsService.findOne.mockResolvedValue({
        id: ingredientId,
        category: IngredientCategory.VIDEO,
        cdnUrl: 'https://cdn.genfeed.ai/ingredients/videos/clip.mp4',
        s3Key: 'ingredients/videos/clip.mp4',
        status: IngredientStatus.GENERATED,
      });
      deps.whisperService.generateCaptions.mockResolvedValue(captionContent);

      const createdCaptionId = testId('caption');
      const createdDoc = {
        id: createdCaptionId,
        content: captionContent,
        format: 'srt',
        language: 'en',
        toJSON: () => ({
          id: createdCaptionId,
          content: captionContent,
        }),
      };
      deps.captionsService.create.mockResolvedValue(createdDoc);

      const result = await controller.create(
        createMockRequest(),
        { format: 'srt', ingredientId, language: 'en' } as never,
        createMockUser(userId),
      );

      expect(result).toBeDefined();
      expect(deps.ingredientsService.findOne).toHaveBeenCalledWith(
        {
          id: ingredientId,
          isDeleted: false,
          organizationId,
        },
        [{ path: 'metadata' }],
      );
      expect(deps.whisperService.generateCaptions).toHaveBeenCalledWith(
        ingredientId.toString(),
        {
          cdnUrl: 'https://cdn.genfeed.ai/ingredients/videos/clip.mp4',
          metadata: undefined,
          s3Key: 'ingredients/videos/clip.mp4',
        },
      );
      expect(deps.captionsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ingredientId,
          organizationId,
          userId,
        }),
      );
    });
  });

  describe('update', () => {
    it('should return serialized caption on successful update', async () => {
      const captionId = testId('caption');
      const updated = {
        id: captionId,
        content: 'Updated',
        toJSON: () => ({ id: captionId, content: 'Updated' }),
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
      const captionId = testId('caption');
      const deleted = {
        id: captionId,
        isDeleted: true,
        toJSON: () => ({ id: captionId, isDeleted: true }),
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
