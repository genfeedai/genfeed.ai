import { ImageGenerationService } from '@api/collections/images/services/image-generation.service';
import { VideoGenerationService } from '@api/collections/videos/services/video-generation.service';
import { CreditDeductionQueueService } from '@api/queues/credit-deduction/credit-deduction-queue.service';
import { BotMediaGenerationDispatcherService } from '@api/services/bot-gateway/bot-media-generation-dispatcher.service';
import { BotCommandType } from '@genfeedai/enums';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('BotMediaGenerationDispatcherService', () => {
  const request = {} as Request;
  const user = {
    brandId: 'brand-1',
    credentialId: 'credential-1',
    organizationId: 'org-1',
    userId: 'user-1',
  };
  const onPlaceholderCreated = vi.fn().mockResolvedValue(undefined);

  let service: BotMediaGenerationDispatcherService;
  let imageGenerationService: vi.Mocked<
    Pick<ImageGenerationService, 'generateImage'>
  >;
  let videoGenerationService: vi.Mocked<
    Pick<VideoGenerationService, 'generateVideo'>
  >;
  let creditQueue: vi.Mocked<
    Pick<CreditDeductionQueueService, 'queueByokUsage' | 'queueDeduction'>
  >;

  beforeEach(async () => {
    imageGenerationService = {
      generateImage: vi.fn(async (_user, _dto, generationRequest, callback) => {
        await callback?.('image-1');
        Object.assign(generationRequest, {
          creditsConfig: {
            amount: 12,
            deferred: false,
            description: 'Bot media generation',
          },
        });
        return { data: { attributes: {}, id: 'image-1', type: 'images' } };
      }),
    };
    videoGenerationService = {
      generateVideo: vi.fn(async (_user, _dto, generationRequest, callback) => {
        await callback?.('video-1');
        Object.assign(generationRequest, {
          creditsConfig: {
            amount: 40,
            deferred: false,
            description: 'Bot media generation',
          },
        });
        return { data: { attributes: {}, id: 'video-1', type: 'videos' } };
      }),
    };
    creditQueue = {
      queueByokUsage: vi.fn().mockResolvedValue(undefined),
      queueDeduction: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BotMediaGenerationDispatcherService,
        { provide: ImageGenerationService, useValue: imageGenerationService },
        { provide: VideoGenerationService, useValue: videoGenerationService },
        { provide: CreditDeductionQueueService, useValue: creditQueue },
      ],
    }).compile();

    service = module.get(BotMediaGenerationDispatcherService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches image generation and queues model-derived credits', async () => {
    await expect(
      service.generate({
        command: BotCommandType.PROMPT_IMAGE,
        onPlaceholderCreated,
        prompt: 'a product launch',
        request,
        user,
      }),
    ).resolves.toEqual({ ingredientId: 'image-1' });

    expect(imageGenerationService.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', userId: 'user-1' }),
      expect.objectContaining({
        brandId: 'brand-1',
        outputs: 1,
        text: 'a product launch',
        waitForCompletion: false,
      }),
      expect.objectContaining({
        context: expect.objectContaining({ organizationId: 'org-1' }),
        user: expect.objectContaining({ userId: 'user-1' }),
      }),
      onPlaceholderCreated,
    );
    expect(creditQueue.queueDeduction).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 12,
        idempotencyKey: 'bot-media-image-1',
        settlementAssetId: 'image-1',
      }),
    );
  });

  it('dispatches video generation through the canonical video service', async () => {
    await expect(
      service.generate({
        command: BotCommandType.PROMPT_VIDEO,
        onPlaceholderCreated,
        prompt: 'a product launch',
        request,
        user,
      }),
    ).resolves.toEqual({ ingredientId: 'video-1' });

    expect(videoGenerationService.generateVideo).toHaveBeenCalled();
    expect(creditQueue.queueDeduction).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 40,
        idempotencyKey: 'bot-media-video-1',
      }),
    );
  });

  it('records BYOK usage without deducting organization credits', async () => {
    imageGenerationService.generateImage.mockImplementationOnce(
      async (_user, _dto, generationRequest, callback) => {
        await callback?.('image-byok');
        Object.assign(generationRequest, {
          creditsConfig: {
            amount: 7,
            deferred: false,
            description: 'Bot media generation',
            isByokBypass: true,
          },
        });
        return {
          data: { attributes: {}, id: 'image-byok', type: 'images' },
        };
      },
    );

    await service.generate({
      command: BotCommandType.PROMPT_IMAGE,
      onPlaceholderCreated,
      prompt: 'a product launch',
      request,
      user,
    });

    expect(creditQueue.queueByokUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 7,
        idempotencyKey: 'bot-media-image-byok',
      }),
    );
    expect(creditQueue.queueDeduction).not.toHaveBeenCalled();
  });

  it('rejects a generation response without a durable ingredient id', async () => {
    imageGenerationService.generateImage.mockResolvedValueOnce({ data: null });

    await expect(
      service.generate({
        command: BotCommandType.PROMPT_IMAGE,
        onPlaceholderCreated,
        prompt: 'a product launch',
        request,
        user,
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(creditQueue.queueDeduction).not.toHaveBeenCalled();
  });

  it('rejects commands outside the media-generation boundary', async () => {
    await expect(
      service.generate({
        command: BotCommandType.STATUS,
        onPlaceholderCreated,
        prompt: 'status',
        request,
        user,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(imageGenerationService.generateImage).not.toHaveBeenCalled();
    expect(videoGenerationService.generateVideo).not.toHaveBeenCalled();
  });
});
