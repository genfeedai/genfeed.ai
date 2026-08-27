import type { AssetDocument } from '@server/collections/assets/schemas/asset.schema';
import { AssetsService } from '@server/collections/assets/services/assets.service';
import { ModelsService } from '@server/collections/models/services/models.service';
import { ReplicateGenerationWebhookHandler } from '@api/endpoints/webhooks/replicate/handlers/replicate-generation-webhook.handler';
import { WebhooksService } from '@server/endpoints/webhooks/webhooks.service';
import { NotificationsPublisherService } from '@server/services/notifications/publisher/notifications-publisher.service';
import { ModelCategory } from '@genfeedai/enums';
import type { ReplicateWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

const ALLOWED_URL = 'https://replicate.delivery/pbxt/abc/out-0.png';
const FOREIGN_URL = 'https://evil.example.com/out-0.png';

describe('ReplicateGenerationWebhookHandler', () => {
  let handler: ReplicateGenerationWebhookHandler;
  let assetsService: { findOne: vi.Mock; patch: vi.Mock };
  let loggerService: { error: vi.Mock; log: vi.Mock; warn: vi.Mock };
  let webhooksService: {
    handleFailedGeneration: vi.Mock;
    processAssetFromWebhook: vi.Mock;
    processMediaFromWebhook: vi.Mock;
  };

  const payloadWith = (output: unknown): ReplicateWebhookPayload =>
    ({
      id: 'pred_123',
      model: 'owner/some-model',
      output,
      status: 'succeeded',
    }) as unknown as ReplicateWebhookPayload;

  beforeEach(async () => {
    assetsService = {
      findOne: vi.fn().mockResolvedValue(null),
      patch: vi.fn(),
    };
    loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
    webhooksService = {
      handleFailedGeneration: vi.fn(),
      processAssetFromWebhook: vi.fn(),
      processMediaFromWebhook: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReplicateGenerationWebhookHandler,
        { provide: AssetsService, useValue: assetsService },
        { provide: LoggerService, useValue: loggerService },
        {
          provide: ModelsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue({
              category: ModelCategory.IMAGE,
            }),
          },
        },
        {
          provide: NotificationsPublisherService,
          useValue: { publishAssetStatus: vi.fn() },
        },
        { provide: WebhooksService, useValue: webhooksService },
      ],
    }).compile();

    handler = module.get(ReplicateGenerationWebhookHandler);
  });

  describe('media generation output', () => {
    it('fetches an output URL served by Replicate', async () => {
      await handler.handleCompleted(payloadWith(ALLOWED_URL));

      expect(webhooksService.processMediaFromWebhook).toHaveBeenCalledWith(
        'replicate',
        expect.anything(),
        'pred_123',
        ALLOWED_URL,
      );
    });

    it('refuses to fetch an output URL on a foreign host', async () => {
      await handler.handleCompleted(payloadWith(FOREIGN_URL));

      expect(webhooksService.processMediaFromWebhook).not.toHaveBeenCalled();
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('rejected by host allowlist'),
        expect.objectContaining({ predictionId: 'pred_123' }),
      );
    });

    it('drops only the foreign entries of a mixed output array', async () => {
      await handler.handleCompleted(payloadWith([FOREIGN_URL, ALLOWED_URL]));

      expect(webhooksService.processMediaFromWebhook).toHaveBeenCalledTimes(1);
      expect(webhooksService.processMediaFromWebhook).toHaveBeenCalledWith(
        'replicate',
        expect.anything(),
        'pred_123_1',
        ALLOWED_URL,
      );
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('rejected by host allowlist'),
        { index: 0, predictionId: 'pred_123' },
      );
    });

    it('warns when an array carries no usable URL at all', async () => {
      await handler.handleCompleted(payloadWith([FOREIGN_URL]));

      expect(webhooksService.processMediaFromWebhook).not.toHaveBeenCalled();
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('no URLs'),
        expect.objectContaining({ predictionId: 'pred_123' }),
      );
    });
  });

  describe('asset generation output', () => {
    const asset = { id: 'asset_1', userId: 'user_1' } as AssetDocument;

    beforeEach(() => {
      assetsService.findOne.mockResolvedValue(asset);
    });

    it('uploads an asset URL served by Replicate', async () => {
      await handler.handleCompleted(payloadWith([ALLOWED_URL]));

      expect(webhooksService.processAssetFromWebhook).toHaveBeenCalledWith(
        'replicate',
        'asset_1',
        ALLOWED_URL,
      );
    });

    it('refuses to upload an asset URL on a foreign host', async () => {
      await handler.handleCompleted(payloadWith([FOREIGN_URL]));

      expect(webhooksService.processAssetFromWebhook).not.toHaveBeenCalled();
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('rejected by host allowlist'),
        expect.objectContaining({ assetId: 'asset_1' }),
      );
    });
  });
});
