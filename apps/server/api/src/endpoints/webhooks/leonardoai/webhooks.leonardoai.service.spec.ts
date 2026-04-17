import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { LeonardoaiWebhookService } from '@api/endpoints/webhooks/leonardoai/webhooks.leonardoai.service';
import type { LeonardoAIWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMockDeps() {
  return {
    logger: {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    },
    metadataService: {
      findOne: vi.fn(),
      patch: vi.fn(),
    },
  };
}

describe('LeonardoaiWebhookService', () => {
  let service: LeonardoaiWebhookService;
  let deps: ReturnType<typeof createMockDeps>;

  beforeEach(async () => {
    deps = createMockDeps();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeonardoaiWebhookService,
        { provide: LoggerService, useValue: deps.logger },
        { provide: MetadataService, useValue: deps.metadataService },
      ],
    }).compile();

    service = module.get<LeonardoaiWebhookService>(LeonardoaiWebhookService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return early when no generationId', async () => {
    const body = { customId: 'abc', data: null } as LeonardoAIWebhookPayload;

    await service.handleCallback(body);

    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('no generationId'),
    );
    expect(deps.metadataService.findOne).not.toHaveBeenCalled();
  });

  it('should return early when no customId', async () => {
    const body = {
      data: null,
      generationId: 'gen-123',
    } as LeonardoAIWebhookPayload;

    await service.handleCallback(body);

    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('no customId'),
    );
    expect(deps.metadataService.findOne).not.toHaveBeenCalled();
  });

  it('should return early when metadata not found', async () => {
    const metadataId = '507f191e810c19729de860ee'.toHexString();
    const body = {
      customId: metadataId,
      data: null,
      generationId: 'gen-123',
      status: 'COMPLETE',
    } as LeonardoAIWebhookPayload;

    deps.metadataService.findOne.mockResolvedValue(null);

    await service.handleCallback(body);

    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('metadata not found'),
      expect.objectContaining({ metadataId }),
    );
    expect(deps.metadataService.patch).not.toHaveBeenCalled();
  });

  it('should store first image URL on COMPLETE with images', async () => {
    const metadataId = '507f191e810c19729de860ee'.toHexString();
    const body = {
      customId: metadataId,
      data: null,
      generationId: 'gen-123',
      images: [
        { url: 'https://cdn.leonardo.ai/img1.png' },
        { url: 'https://cdn.leonardo.ai/img2.png' },
      ],
      status: 'COMPLETE',
    } as LeonardoAIWebhookPayload;

    deps.metadataService.findOne.mockResolvedValue({ _id: metadataId });
    deps.metadataService.patch.mockResolvedValue({});

    await service.handleCallback(body);

    expect(deps.metadataService.patch).toHaveBeenCalledWith(
      metadataId,
      expect.objectContaining({
        result: 'https://cdn.leonardo.ai/img1.png',
      }),
    );
  });

  it('should stringify images array when first image has no url', async () => {
    const metadataId = '507f191e810c19729de860ee'.toHexString();
    const images = [{ id: 'img-1' }];
    const body = {
      customId: metadataId,
      data: null,
      generationId: 'gen-123',
      images,
      status: 'COMPLETE',
    } as LeonardoAIWebhookPayload;

    deps.metadataService.findOne.mockResolvedValue({ _id: metadataId });
    deps.metadataService.patch.mockResolvedValue({});

    await service.handleCallback(body);

    expect(deps.metadataService.patch).toHaveBeenCalledWith(
      metadataId,
      expect.objectContaining({
        result: JSON.stringify(images),
      }),
    );
  });

  it('should set error on FAILED status', async () => {
    const metadataId = '507f191e810c19729de860ee'.toHexString();
    const body = {
      customId: metadataId,
      data: null,
      generationId: 'gen-123',
      status: 'FAILED',
    } as LeonardoAIWebhookPayload;

    deps.metadataService.findOne.mockResolvedValue({ _id: metadataId });
    deps.metadataService.patch.mockResolvedValue({});

    await service.handleCallback(body);

    expect(deps.metadataService.patch).toHaveBeenCalledWith(
      metadataId,
      expect.objectContaining({
        error: 'Image generation failed',
      }),
    );
  });

  it('should patch with empty object for non-COMPLETE non-FAILED status', async () => {
    const metadataId = '507f191e810c19729de860ee'.toHexString();
    const body = {
      customId: metadataId,
      data: null,
      generationId: 'gen-123',
      status: 'PROCESSING',
    } as LeonardoAIWebhookPayload;

    deps.metadataService.findOne.mockResolvedValue({ _id: metadataId });
    deps.metadataService.patch.mockResolvedValue({});

    await service.handleCallback(body);

    expect(deps.metadataService.patch).toHaveBeenCalledWith(metadataId, {});
  });

  it('should look up metadata with correct filter', async () => {
    const metadataId = '507f191e810c19729de860ee'.toHexString();
    const body = {
      customId: metadataId,
      data: null,
      generationId: 'gen-123',
      status: 'COMPLETE',
    } as LeonardoAIWebhookPayload;

    deps.metadataService.findOne.mockResolvedValue(null);

    await service.handleCallback(body);

    expect(deps.metadataService.findOne).toHaveBeenCalledWith({
      _id: metadataId,
      isDeleted: false,
    });
  });

  it('should log completion with generationId, metadataId, and status', async () => {
    const metadataId = '507f191e810c19729de860ee'.toHexString();
    const body = {
      customId: metadataId,
      data: null,
      generationId: 'gen-xyz',
      status: 'COMPLETE',
    } as LeonardoAIWebhookPayload;

    deps.metadataService.findOne.mockResolvedValue({ _id: metadataId });
    deps.metadataService.patch.mockResolvedValue({});

    await service.handleCallback(body);

    expect(deps.logger.log).toHaveBeenCalledWith(
      expect.stringContaining('completed'),
      expect.objectContaining({
        generationId: 'gen-xyz',
        metadataId,
        status: 'COMPLETE',
      }),
    );
  });
});
