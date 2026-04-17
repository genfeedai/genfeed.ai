import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { HeygenWebhookService } from '@api/endpoints/webhooks/heygen/webhooks.heygen.service';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { MicroservicesService } from '@api/services/microservices/microservices.service';
import type { HeygenWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMockDeps() {
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const metadataService = {
    findOne: vi.fn(),
    patch: vi.fn(),
  };

  const ingredientsService = {
    findOne: vi.fn(),
  };

  const clipProjectsService = {
    patch: vi.fn(),
  };

  const clipResultsService = {
    findByProject: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
  };

  const microservicesService = {
    notifyWebhook: vi.fn().mockResolvedValue(undefined),
  };

  const webhooksService = {
    processMediaForIngredient: vi.fn().mockResolvedValue(undefined),
  };

  return {
    clipProjectsService,
    clipResultsService,
    ingredientsService,
    logger,
    metadataService,
    microservicesService,
    webhooksService,
  };
}

describe('HeygenWebhookService', () => {
  let service: HeygenWebhookService;
  let deps: ReturnType<typeof createMockDeps>;

  beforeEach(async () => {
    deps = createMockDeps();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HeygenWebhookService,
        { provide: ClipProjectsService, useValue: deps.clipProjectsService },
        { provide: ClipResultsService, useValue: deps.clipResultsService },
        { provide: IngredientsService, useValue: deps.ingredientsService },
        { provide: LoggerService, useValue: deps.logger },
        { provide: MetadataService, useValue: deps.metadataService },
        {
          provide: MicroservicesService,
          useValue: deps.microservicesService,
        },
        { provide: WebhooksService, useValue: deps.webhooksService },
      ],
    }).compile();

    service = module.get<HeygenWebhookService>(HeygenWebhookService);
    deps.ingredientsService.findOne.mockResolvedValue({
      _id: 'ingredient-1',
      metadata: '507f191e810c19729de860ee'.toHexString(),
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should notify webhook on every callback', async () => {
    const body: HeygenWebhookPayload = {
      callback_id: '507f191e810c19729de860ee'.toHexString(),
      event_data: {},
      event_type: 'video_completed',
    };

    deps.metadataService.findOne.mockResolvedValue({
      _id: body.callback_id,
    });
    deps.metadataService.patch.mockResolvedValue({});
    deps.clipResultsService.findOne.mockResolvedValue(null);

    await service.handleCallback(body);

    expect(deps.microservicesService.notifyWebhook).toHaveBeenCalledWith(
      'heygen',
      'video_completed',
      expect.objectContaining({
        metadata: expect.objectContaining({
          callbackId: body.callback_id,
        }),
      }),
    );
  });

  it('should use "unknown" as event_type when not provided', async () => {
    const body: HeygenWebhookPayload = {
      callback_id: '507f191e810c19729de860ee'.toHexString(),
      event_data: {},
    };

    deps.metadataService.findOne.mockResolvedValue({ _id: body.callback_id });
    deps.metadataService.patch.mockResolvedValue({});
    deps.clipResultsService.findOne.mockResolvedValue(null);

    await service.handleCallback(body);

    expect(deps.microservicesService.notifyWebhook).toHaveBeenCalledWith(
      'heygen',
      'unknown',
      expect.anything(),
    );
  });

  it('should return early and warn when no callback_id is provided', async () => {
    const body: HeygenWebhookPayload = {
      event_data: {},
      event_type: 'video_completed',
    };

    await service.handleCallback(body);

    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('no callback_id'),
    );
    expect(deps.clipResultsService.findOne).not.toHaveBeenCalled();
    expect(deps.metadataService.findOne).not.toHaveBeenCalled();
  });

  it('should return early when metadata is not found', async () => {
    const body: HeygenWebhookPayload = {
      callback_id: '507f191e810c19729de860ee'.toHexString(),
      event_data: {},
      event_type: 'video_completed',
    };

    deps.metadataService.findOne.mockResolvedValue(null);
    deps.clipResultsService.findOne.mockResolvedValue(null);
    deps.ingredientsService.findOne.mockResolvedValue(null);

    await service.handleCallback(body);

    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('callback target not found'),
      expect.objectContaining({
        callbackId: body.callback_id,
        hasIngredient: false,
        hasMetadata: false,
      }),
    );
    expect(deps.metadataService.patch).not.toHaveBeenCalled();
  });

  it('should store video_url as result for video_completed events', async () => {
    const metadataId = '507f191e810c19729de860ee'.toHexString();
    const body: HeygenWebhookPayload = {
      callback_id: metadataId,
      event_data: { video_url: 'https://cdn.heygen.com/video.mp4' },
      event_type: 'video_completed',
    };

    deps.metadataService.findOne.mockResolvedValue({ _id: metadataId });
    deps.metadataService.patch.mockResolvedValue({});
    deps.clipResultsService.findOne.mockResolvedValue(null);

    await service.handleCallback(body);

    expect(deps.metadataService.patch).toHaveBeenCalledWith(metadataId, {
      result: 'https://cdn.heygen.com/video.mp4',
    });
  });

  it('should store stringified event_data as error for avatar_video.failure', async () => {
    const metadataId = '507f191e810c19729de860ee'.toHexString();
    const eventData = { code: 'TIMEOUT', message: 'Generation timed out' };
    const body: HeygenWebhookPayload = {
      callback_id: metadataId,
      event_data: eventData,
      event_type: 'avatar_video.failure',
    };

    deps.metadataService.findOne.mockResolvedValue({ _id: metadataId });
    deps.metadataService.patch.mockResolvedValue({});
    deps.clipResultsService.findOne.mockResolvedValue(null);

    await service.handleCallback(body);

    expect(deps.metadataService.patch).toHaveBeenCalledWith(
      metadataId,
      expect.objectContaining({
        error: JSON.stringify(eventData),
      }),
    );
  });

  it('should stringify event_data as result for non-video events', async () => {
    const metadataId = '507f191e810c19729de860ee'.toHexString();
    const eventData = { status: 'ready' };
    const body: HeygenWebhookPayload = {
      callback_id: metadataId,
      event_data: eventData,
      event_type: 'avatar_created',
    };

    deps.metadataService.findOne.mockResolvedValue({ _id: metadataId });
    deps.metadataService.patch.mockResolvedValue({});
    deps.clipResultsService.findOne.mockResolvedValue(null);

    await service.handleCallback(body);

    expect(deps.metadataService.patch).toHaveBeenCalledWith(metadataId, {
      result: JSON.stringify(eventData),
    });
  });

  it('should rethrow errors from metadataService.findOne', async () => {
    const body: HeygenWebhookPayload = {
      callback_id: '507f191e810c19729de860ee'.toHexString(),
      event_data: {},
      event_type: 'video_completed',
    };

    const dbError = new Error('Database connection lost');
    deps.metadataService.findOne.mockRejectedValue(dbError);
    deps.clipResultsService.findOne.mockResolvedValue(null);

    await expect(service.handleCallback(body)).rejects.toThrow(
      'Database connection lost',
    );
    expect(deps.logger.error).toHaveBeenCalled();
  });

  it('should rethrow errors from metadataService.patch', async () => {
    const metadataId = '507f191e810c19729de860ee'.toHexString();
    const body: HeygenWebhookPayload = {
      callback_id: metadataId,
      event_data: {},
      event_type: 'video_completed',
    };

    deps.metadataService.findOne.mockResolvedValue({ _id: metadataId });
    deps.metadataService.patch.mockRejectedValue(new Error('Write failed'));
    deps.clipResultsService.findOne.mockResolvedValue(null);

    await expect(service.handleCallback(body)).rejects.toThrow('Write failed');
  });

  it('should update a clip result and complete the parent project when the final clip succeeds', async () => {
    const clipResultId = '507f191e810c19729de860ee'.toHexString();
    const projectId = '507f191e810c19729de860ee'.toHexString();
    const body: HeygenWebhookPayload = {
      event_data: {
        callback_id: clipResultId,
        url: 'https://cdn.heygen.com/clip.mp4',
        video_id: 'provider-job-1',
      },
      event_type: 'avatar_video.success',
    };

    deps.clipResultsService.findOne.mockResolvedValue({
      _id: clipResultId,
      project: projectId,
    });
    deps.clipResultsService.findByProject.mockResolvedValue([
      { status: 'completed' },
      { status: 'failed' },
    ]);
    deps.clipResultsService.patch.mockResolvedValue({});
    deps.clipProjectsService.patch.mockResolvedValue({});

    await service.handleCallback(body);

    expect(deps.clipResultsService.patch).toHaveBeenCalledWith(clipResultId, {
      providerJobId: 'provider-job-1',
      status: 'completed',
      videoUrl: 'https://cdn.heygen.com/clip.mp4',
    });
    expect(deps.clipProjectsService.patch).toHaveBeenCalledWith(projectId, {
      $set: {
        progress: 100,
        status: 'completed',
      },
      $unset: {
        error: '',
      },
    });
  });

  it('should fail the parent project when the final clip fails', async () => {
    const clipResultId = '507f191e810c19729de860ee'.toHexString();
    const projectId = '507f191e810c19729de860ee'.toHexString();
    const body: HeygenWebhookPayload = {
      event_data: {
        callback_id: clipResultId,
        error: 'Generation timed out',
        video_id: 'provider-job-1',
      },
      event_type: 'avatar_video.failed',
    };

    deps.clipResultsService.findOne.mockResolvedValue({
      _id: clipResultId,
      project: projectId,
    });
    deps.clipResultsService.findByProject.mockResolvedValue([
      { status: 'failed' },
    ]);
    deps.clipResultsService.patch.mockResolvedValue({});
    deps.clipProjectsService.patch.mockResolvedValue({});

    await service.handleCallback(body);

    expect(deps.clipResultsService.patch).toHaveBeenCalledWith(clipResultId, {
      providerJobId: 'provider-job-1',
      status: 'failed',
    });
    expect(deps.clipProjectsService.patch).toHaveBeenCalledWith(projectId, {
      error: 'All clip generations failed.',
      progress: 100,
      status: 'failed',
    });
  });

  it('should continue to process legacy metadata-backed avatar success callbacks', async () => {
    const metadataId = '507f191e810c19729de860ee'.toHexString();
    const body: HeygenWebhookPayload = {
      callback_id: metadataId,
      event_data: {
        callback_id: metadataId,
        url: 'https://cdn.heygen.com/avatar.mp4',
      },
      event_type: 'avatar_video.success',
    };

    deps.clipResultsService.findOne.mockResolvedValue(null);
    deps.metadataService.findOne.mockResolvedValue({ _id: metadataId });
    deps.ingredientsService.findOne.mockResolvedValue({
      _id: 'ingredient-legacy',
      metadata: metadataId,
    });
    deps.metadataService.patch.mockResolvedValue({});

    await service.handleCallback(body);

    expect(deps.webhooksService.processMediaForIngredient).toHaveBeenCalledWith(
      'ingredient-legacy',
      'avatar',
      'https://cdn.heygen.com/avatar.mp4',
      undefined,
    );
  });

  it('should resolve ingredient-backed avatar success callbacks when callback_id is the ingredient id', async () => {
    const ingredientId = '507f191e810c19729de860ee'.toHexString();
    const metadataId = '507f191e810c19729de860ee'.toHexString();
    const body: HeygenWebhookPayload = {
      callback_id: ingredientId,
      event_data: {
        callback_id: ingredientId,
        url: 'https://cdn.heygen.com/avatar.mp4',
        video_id: 'provider-video-42',
      },
      event_type: 'avatar_video.success',
    };

    deps.clipResultsService.findOne.mockResolvedValue(null);
    deps.metadataService.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ _id: metadataId });
    deps.ingredientsService.findOne.mockResolvedValue({
      _id: ingredientId,
      metadata: metadataId,
    });
    deps.metadataService.patch.mockResolvedValue({});

    await service.handleCallback(body);

    expect(deps.webhooksService.processMediaForIngredient).toHaveBeenCalledWith(
      ingredientId,
      'avatar',
      'https://cdn.heygen.com/avatar.mp4',
      'provider-video-42',
    );
    expect(deps.metadataService.patch).toHaveBeenCalledWith(
      metadataId,
      expect.objectContaining({
        externalId: 'provider-video-42',
        result: 'https://cdn.heygen.com/avatar.mp4',
      }),
    );
  });
});
