import { createHmac } from 'node:crypto';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { TrainingsService } from '@api/collections/trainings/services/trainings.service';
import { ReplicateGenerationWebhookHandler } from '@api/endpoints/webhooks/replicate/handlers/replicate-generation-webhook.handler';
import { ReplicateWebhookController } from '@api/endpoints/webhooks/replicate/webhooks.replicate.controller';
import { ReplicateWebhookVerificationService } from '@api/endpoints/webhooks/replicate/webhooks.replicate.verification.service';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { TrainingStatus } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { validateWebhook } from 'replicate';

vi.mock('replicate', () => ({
  validateWebhook: vi.fn().mockResolvedValue(true),
}));

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: {
    getCallerName: vi.fn().mockReturnValue('replicate callback'),
  },
}));

describe('ReplicateWebhookController', () => {
  let controller: ReplicateWebhookController;
  let configService: ConfigService;
  let modelRegistrationService: { createFromTraining: vi.Mock };
  let loggerService: vi.Mocked<LoggerService>;
  let generationWebhookHandler: {
    handleCompleted: vi.Mock;
    handleFailed: vi.Mock;
  };
  let trainingsService: { findOne: vi.Mock; patch: vi.Mock };
  let verificationService: {
    deferUntrustedDelivery: vi.Mock;
    isReplay: vi.Mock;
    resolveTrustedPayload: vi.Mock;
  };

  let mockRequest: Request;

  /** Lets the `setImmediate` async-processing callback run before asserting. */
  const flushAsyncProcessing = () =>
    new Promise((resolve) => setImmediate(resolve));

  beforeEach(async () => {
    mockRequest = {
      body: {},
      headers: { 'webhook-id': 'msg_abc' },
      ip: '127.0.0.1',
      rawBody: Buffer.from('{}'),
    } as unknown as Request;

    vi.mocked(validateWebhook).mockResolvedValue(true);
    verificationService = {
      deferUntrustedDelivery: vi.fn().mockResolvedValue(undefined),
      isReplay: vi.fn().mockResolvedValue(false),
      resolveTrustedPayload: vi.fn(async (payload: unknown) => payload),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReplicateWebhookController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            // Signing secret required — endpoint fails closed without it.
            get: vi.fn().mockReturnValue('test-replicate-signing-secret'),
            isProduction: false,
          },
        },
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: ModelsService,
          useValue: {
            findOne: vi.fn(),
          },
        },
        {
          provide: WebhooksService,
          useValue: {
            handleFailedGeneration: vi.fn(),
            processAssetFromWebhook: vi.fn(),
            processMediaFromWebhook: vi.fn(),
          },
        },
        {
          provide: TrainingsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue(null),
            patch: vi.fn(),
          },
        },
        {
          provide: AssetsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue(null),
            patch: vi.fn(),
          },
        },
        {
          provide: NotificationsPublisherService,
          useValue: {
            publishAssetStatus: vi.fn(),
            publishTrainingStatus: vi.fn(),
          },
        },
        {
          provide: ModelRegistrationService,
          useValue: {
            createFromTraining: vi.fn(),
          },
        },
        {
          provide: ReplicateGenerationWebhookHandler,
          useValue: {
            handleCompleted: vi.fn(),
            handleFailed: vi.fn(),
          },
        },
        {
          provide: ReplicateWebhookVerificationService,
          useValue: verificationService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReplicateWebhookController>(
      ReplicateWebhookController,
    );
    loggerService = module.get(LoggerService);
    configService = module.get(ConfigService);
    modelRegistrationService = module.get(ModelRegistrationService);
    generationWebhookHandler = module.get(ReplicateGenerationWebhookHandler);
    trainingsService = module.get(TrainingsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleCallback', () => {
    it('should handle callback successfully and return webhook processed', async () => {
      const body = {
        id: 'pred_123',
        output: ['result.png'],
        status: 'succeeded',
      };

      const result = await controller.handleCallback(mockRequest, body);

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('replicate callback received'),
        body,
      );
      expect(result).toEqual({ detail: 'Webhook processed' });
    });

    it('should suppress a replayed delivery without processing it', async () => {
      verificationService.isReplay.mockResolvedValue(true);
      const body = {
        id: 'pred_replay',
        output: ['https://replicate.delivery/pbxt/out.png'],
        status: 'succeeded',
      };

      const result = await controller.handleCallback(mockRequest, body);
      await flushAsyncProcessing();

      expect(verificationService.isReplay).toHaveBeenCalledWith('msg_abc');
      expect(result).toEqual({ detail: 'Webhook already processed' });
      expect(verificationService.resolveTrustedPayload).not.toHaveBeenCalled();
      expect(generationWebhookHandler.handleCompleted).not.toHaveBeenCalled();
    });

    it('should act on the re-fetched payload, not the signed body', async () => {
      // A forged body claiming success for a prediction that actually failed.
      const body = {
        id: 'pred_forged',
        model: 'owner/model',
        output: ['https://evil.example.com/forged.png'],
        status: 'succeeded',
      };

      verificationService.resolveTrustedPayload.mockResolvedValue({
        ...body,
        output: null,
        status: 'failed',
      });

      await controller.handleCallback(mockRequest, body);
      await flushAsyncProcessing();

      expect(verificationService.resolveTrustedPayload).toHaveBeenCalledWith(
        body,
        'prediction',
      );
      expect(generationWebhookHandler.handleCompleted).not.toHaveBeenCalled();
      expect(generationWebhookHandler.handleFailed).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'pred_forged', status: 'failed' }),
        undefined,
      );
    });

    it('should not dispatch a payload whose prediction cannot be trusted', async () => {
      const body = {
        id: 'pred_untrusted',
        model: 'owner/model',
        output: ['https://evil.example.com/forged.png'],
        status: 'succeeded',
      };
      verificationService.resolveTrustedPayload.mockResolvedValue(null);

      await controller.handleCallback(mockRequest, body);
      await flushAsyncProcessing();

      expect(trainingsService.findOne).toHaveBeenCalledOnce();
      expect(generationWebhookHandler.handleCompleted).not.toHaveBeenCalled();
      expect(generationWebhookHandler.handleFailed).not.toHaveBeenCalled();
      expect(verificationService.deferUntrustedDelivery).toHaveBeenCalledWith(
        body,
      );
    });

    it.each([
      {
        label: 'pretty JSON',
        rawBody: '{\n  "id": "pred_raw",\n  "status": "succeeded"\n}',
        body: { id: 'pred_raw', status: 'succeeded' },
      },
      {
        label: 'escaped Unicode',
        rawBody: '{"id":"pred_raw","status":"succeeded","note":"\\u0061"}',
        body: { id: 'pred_raw', status: 'succeeded', note: 'a' },
      },
      {
        label: 'exponent notation',
        rawBody: '{"id":"pred_raw","status":"succeeded","metric":1e+3}',
        body: { id: 'pred_raw', status: 'succeeded', metric: 1000 },
      },
      {
        label: 'UTF-8 BOM',
        rawBody: '\uFEFF{"id":"pred_raw","status":"succeeded"}',
        body: { id: 'pred_raw', status: 'succeeded' },
      },
    ])(
      'authenticates the original bytes for $label',
      async ({ rawBody, body }) => {
        const actual =
          await vi.importActual<typeof import('replicate')>('replicate');
        vi.mocked(validateWebhook).mockImplementationOnce(
          actual.validateWebhook,
        );
        const key = Buffer.from('local-callback-test-key');
        const secret = `whsec_${key.toString('base64')}`;
        vi.spyOn(configService, 'get').mockReturnValue(secret);
        const timestamp = '1700000000';
        const signature = createHmac('sha256', key)
          .update(`msg_raw.${timestamp}.${rawBody}`)
          .digest('base64');
        const request = Object.assign(mockRequest, {
          body,
          headers: {
            'webhook-id': 'msg_raw',
            'webhook-signature': `v1,${signature}`,
            'webhook-timestamp': timestamp,
          },
          rawBody: Buffer.from(rawBody),
        });

        await expect(controller.handleCallback(request, body)).resolves.toEqual(
          {
            detail: 'Webhook processed',
          },
        );
        await flushAsyncProcessing();
        expect(verificationService.isReplay).toHaveBeenCalledWith('msg_raw');
      },
    );

    it('rejects altered captured bytes before replay or downstream work', async () => {
      const actual =
        await vi.importActual<typeof import('replicate')>('replicate');
      vi.mocked(validateWebhook).mockImplementationOnce(actual.validateWebhook);
      const key = Buffer.from('local-callback-test-key');
      vi.spyOn(configService, 'get').mockReturnValue(
        `whsec_${key.toString('base64')}`,
      );
      const rawBody = '{ "id": "pred_raw", "status": "succeeded" }';
      const timestamp = '1700000000';
      const signature = createHmac('sha256', key)
        .update(`msg_raw.${timestamp}.${rawBody}`)
        .digest('base64');
      const body = { id: 'pred_raw', status: 'succeeded' };
      const request = Object.assign(mockRequest, {
        body,
        headers: {
          'webhook-id': 'msg_raw',
          'webhook-signature': `v1,${signature}`,
          'webhook-timestamp': timestamp,
        },
        rawBody: Buffer.from(`${rawBody} `),
      });

      await expect(
        controller.handleCallback(request, body),
      ).rejects.toMatchObject({
        status: 401,
      });
      expect(verificationService.isReplay).not.toHaveBeenCalled();
      expect(trainingsService.findOne).not.toHaveBeenCalled();
      expect(verificationService.resolveTrustedPayload).not.toHaveBeenCalled();
    });

    it('fails closed when original body bytes were not captured', async () => {
      const request = mockRequest;
      Reflect.deleteProperty(request, 'rawBody');

      await expect(
        controller.handleCallback(request, {
          id: 'pred_raw',
          status: 'succeeded',
        }),
      ).rejects.toMatchObject({ status: 401 });
      expect(validateWebhook).not.toHaveBeenCalled();
      expect(verificationService.isReplay).not.toHaveBeenCalled();
      expect(trainingsService.findOne).not.toHaveBeenCalled();
    });

    it('selects training verification from the persisted row and reuses it', async () => {
      const body = { id: 'train_123', status: 'succeeded' };
      const training = { config: {}, id: 'training_db', userId: 'user_123' };
      trainingsService.findOne
        .mockResolvedValueOnce(training)
        .mockResolvedValue(null);
      trainingsService.patch.mockResolvedValue(training);
      verificationService.resolveTrustedPayload.mockImplementationOnce(
        async (_payload, resourceKind) =>
          resourceKind === 'training'
            ? { ...body, output: { version: 'owner/trained:version' } }
            : null,
      );

      await controller.handleCallback(mockRequest, body);
      await flushAsyncProcessing();

      expect(trainingsService.findOne).toHaveBeenCalledExactlyOnceWith({
        externalId: 'train_123',
      });
      expect(verificationService.resolveTrustedPayload).toHaveBeenCalledWith(
        body,
        'training',
      );
      expect(trainingsService.patch).toHaveBeenCalledWith(
        'training_db',
        expect.objectContaining({
          config: expect.objectContaining({
            trainedModelVersion: 'owner/trained:version',
          }),
          stage: 'READY',
        }),
      );
      expect(
        modelRegistrationService.createFromTraining,
      ).toHaveBeenCalledExactlyOnceWith(training);
      expect(generationWebhookHandler.handleCompleted).not.toHaveBeenCalled();
    });

    it('defers untrusted training state without training completion writes', async () => {
      const body = { id: 'train_untrusted', status: 'succeeded' };
      trainingsService.findOne.mockResolvedValue({ id: 'training_db' });
      verificationService.resolveTrustedPayload.mockResolvedValue(null);

      await controller.handleCallback(mockRequest, body);
      await flushAsyncProcessing();

      expect(verificationService.resolveTrustedPayload).toHaveBeenCalledWith(
        body,
        'training',
      );
      expect(verificationService.deferUntrustedDelivery).toHaveBeenCalledWith(
        body,
      );
      expect(trainingsService.findOne).toHaveBeenCalledOnce();
      expect(trainingsService.patch).not.toHaveBeenCalled();
      expect(
        modelRegistrationService.createFromTraining,
      ).not.toHaveBeenCalled();
      expect(generationWebhookHandler.handleCompleted).not.toHaveBeenCalled();
    });

    it('uses the authoritative failed training status instead of signed success', async () => {
      const body = { id: 'train_failed', status: 'succeeded' };
      trainingsService.findOne.mockResolvedValue({
        config: {},
        id: 'training_db',
        userId: 'user_123',
      });
      verificationService.resolveTrustedPayload.mockResolvedValue({
        ...body,
        error: 'remote failure',
        status: 'failed',
      });

      await controller.handleCallback(mockRequest, body);
      await flushAsyncProcessing();

      expect(trainingsService.patch).toHaveBeenCalledWith(
        'training_db',
        expect.objectContaining({
          config: expect.objectContaining({
            error: 'remote failure',
            status: TrainingStatus.FAILED,
          }),
          stage: 'FAILED',
        }),
      );
      expect(
        modelRegistrationService.createFromTraining,
      ).not.toHaveBeenCalled();
      expect(generationWebhookHandler.handleFailed).not.toHaveBeenCalled();
    });

    it('ignores an untrusted resource-kind field when no training row exists', async () => {
      const body = {
        id: 'pred_123',
        resourceKind: 'training',
        status: 'succeeded',
      };

      await controller.handleCallback(mockRequest, body);
      await flushAsyncProcessing();

      expect(verificationService.resolveTrustedPayload).toHaveBeenCalledWith(
        body,
        'prediction',
      );
      expect(trainingsService.patch).not.toHaveBeenCalled();
    });

    it('should reject when the signing secret is not configured', async () => {
      const body = {
        id: 'pred_456',
        output: ['result.png'],
        status: 'succeeded',
      };

      vi.spyOn(configService, 'get').mockReturnValue(undefined);

      await expect(
        controller.handleCallback(mockRequest, body),
      ).rejects.toThrow();

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'REPLICATE_WEBHOOK_SIGNING_SECRET is not configured',
        ),
      );
      expect(verificationService.isReplay).not.toHaveBeenCalled();
      expect(verificationService.resolveTrustedPayload).not.toHaveBeenCalled();
    });

    it('should reject when the signing secret is blank', async () => {
      const body = {
        id: 'pred_blank_secret',
        output: ['result.png'],
        status: 'succeeded',
      };

      vi.spyOn(configService, 'get').mockReturnValue('   ');

      await expect(
        controller.handleCallback(mockRequest, body),
      ).rejects.toThrow();

      expect(verificationService.isReplay).not.toHaveBeenCalled();
    });

    it('should rethrow error when validation fails', async () => {
      const body = { error: 'Model failed', id: 'pred_err', status: 'failed' };

      // Make validateWebhook return false so the controller throws UNAUTHORIZED
      const replicate = await import('replicate');
      (replicate.validateWebhook as vi.Mock).mockResolvedValue(false);

      await expect(
        controller.handleCallback(mockRequest, body),
      ).rejects.toThrow();

      expect(loggerService.error).toHaveBeenCalled();
    });
  });
});
