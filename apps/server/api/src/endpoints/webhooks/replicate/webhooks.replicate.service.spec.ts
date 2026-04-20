import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ReplicateWebhookService } from '@api/endpoints/webhooks/replicate/webhooks.replicate.service';
import { MicroservicesService } from '@api/services/microservices/microservices.service';
import type { ReplicateWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
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
    microservicesService: {
      notifyWebhook: vi.fn().mockResolvedValue(undefined),
    },
  };
}

function makePayload(
  overrides: Partial<ReplicateWebhookPayload> = {},
): ReplicateWebhookPayload {
  return {
    id: 'pred-123',
    status: 'succeeded',
    ...overrides,
  } as ReplicateWebhookPayload;
}

describe('ReplicateWebhookService', () => {
  let service: ReplicateWebhookService;
  let deps: ReturnType<typeof createMockDeps>;

  beforeEach(async () => {
    deps = createMockDeps();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReplicateWebhookService,
        { provide: LoggerService, useValue: deps.logger },
        { provide: MetadataService, useValue: deps.metadataService },
        {
          provide: MicroservicesService,
          useValue: deps.microservicesService,
        },
      ],
    }).compile();

    service = module.get<ReplicateWebhookService>(ReplicateWebhookService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should fire-and-forget notifyWebhook on every callback', async () => {
    const metadataId = '507f191e810c19729de860ee';
    const body = makePayload({
      webhook_metadata: { metadataId },
    });

    deps.metadataService.findOne.mockResolvedValue({ _id: metadataId });
    deps.metadataService.patch.mockResolvedValue({});

    await service.handleCallback(body);

    expect(deps.microservicesService.notifyWebhook).toHaveBeenCalledWith(
      'replicate',
      'succeeded',
      expect.objectContaining({
        metadata: expect.objectContaining({
          metadataId,
          predictionId: 'pred-123',
        }),
      }),
    );
  });

  it('should return early when no prediction id', async () => {
    const body = makePayload({
      id: undefined as unknown as string,
      webhook_metadata: { metadataId: 'abc' },
    });

    await service.handleCallback(body);

    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('no prediction id'),
    );
    expect(deps.metadataService.findOne).not.toHaveBeenCalled();
  });

  it('should return early when no metadataId in webhook_metadata', async () => {
    const body = makePayload({ webhook_metadata: {} });

    await service.handleCallback(body);

    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('no metadataId'),
    );
  });

  it('should return early when metadata not found', async () => {
    const metadataId = '507f191e810c19729de860ee';
    const body = makePayload({ webhook_metadata: { metadataId } });

    deps.metadataService.findOne.mockResolvedValue(null);

    await service.handleCallback(body);

    expect(deps.metadataService.patch).not.toHaveBeenCalled();
  });

  it('should store string output as result on succeeded', async () => {
    const metadataId = '507f191e810c19729de860ee';
    const body = makePayload({
      output: 'https://replicate.delivery/video.mp4',
      status: 'succeeded',
      webhook_metadata: { metadataId },
    });

    deps.metadataService.findOne.mockResolvedValue({ _id: metadataId });
    deps.metadataService.patch.mockResolvedValue({});

    await service.handleCallback(body);

    expect(deps.metadataService.patch).toHaveBeenCalledWith(metadataId, {
      result: 'https://replicate.delivery/video.mp4',
    });
  });

  it('should extract first URL from array output', async () => {
    const metadataId = '507f191e810c19729de860ee';
    const body = makePayload({
      output: [
        'https://replicate.delivery/img1.png',
        'https://replicate.delivery/img2.png',
      ],
      status: 'succeeded',
      webhook_metadata: { metadataId },
    });

    deps.metadataService.findOne.mockResolvedValue({ _id: metadataId });
    deps.metadataService.patch.mockResolvedValue({});

    await service.handleCallback(body);

    expect(deps.metadataService.patch).toHaveBeenCalledWith(metadataId, {
      result: 'https://replicate.delivery/img1.png',
    });
  });

  it('should stringify output when not a string or string array', async () => {
    const metadataId = '507f191e810c19729de860ee';
    const output = { key: 'value' };
    const body = makePayload({
      output,
      status: 'succeeded',
      webhook_metadata: { metadataId },
    });

    deps.metadataService.findOne.mockResolvedValue({ _id: metadataId });
    deps.metadataService.patch.mockResolvedValue({});

    await service.handleCallback(body);

    expect(deps.metadataService.patch).toHaveBeenCalledWith(metadataId, {
      result: JSON.stringify(output),
    });
  });

  it('should store error string on error payload', async () => {
    const metadataId = '507f191e810c19729de860ee';
    const body = makePayload({
      error: 'NSFW content detected',
      status: 'failed',
      webhook_metadata: { metadataId },
    });

    deps.metadataService.findOne.mockResolvedValue({ _id: metadataId });
    deps.metadataService.patch.mockResolvedValue({});

    await service.handleCallback(body);

    expect(deps.metadataService.patch).toHaveBeenCalledWith(
      metadataId,
      expect.objectContaining({ error: 'NSFW content detected' }),
    );
  });

  it('should stringify non-string error objects', async () => {
    const metadataId = '507f191e810c19729de860ee';
    const errorObj = { code: 500, message: 'Internal' };
    const body = makePayload({
      error: errorObj,
      status: 'failed',
      webhook_metadata: { metadataId },
    });

    deps.metadataService.findOne.mockResolvedValue({ _id: metadataId });
    deps.metadataService.patch.mockResolvedValue({});

    await service.handleCallback(body);

    expect(deps.metadataService.patch).toHaveBeenCalledWith(
      metadataId,
      expect.objectContaining({ error: JSON.stringify(errorObj) }),
    );
  });

  it('should rethrow errors from metadataService', async () => {
    const metadataId = '507f191e810c19729de860ee';
    const body = makePayload({ webhook_metadata: { metadataId } });

    deps.metadataService.findOne.mockRejectedValue(
      new Error('Connection refused'),
    );

    await expect(service.handleCallback(body)).rejects.toThrow(
      'Connection refused',
    );
    expect(deps.logger.error).toHaveBeenCalled();
  });

  it('should not throw when notifyWebhook fails', async () => {
    const metadataId = '507f191e810c19729de860ee';
    const body = makePayload({
      output: 'https://replicate.delivery/ok.mp4',
      status: 'succeeded',
      webhook_metadata: { metadataId },
    });

    deps.microservicesService.notifyWebhook.mockRejectedValue(
      new Error('Notification failed'),
    );
    deps.metadataService.findOne.mockResolvedValue({ _id: metadataId });
    deps.metadataService.patch.mockResolvedValue({});

    // The service catches notifyWebhook errors with .catch(), so this should not throw
    await expect(service.handleCallback(body)).resolves.toBeUndefined();
  });
});
