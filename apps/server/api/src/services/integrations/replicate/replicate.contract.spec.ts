// Pin IS_CLOUD=true so the cloud request contract (webhook + events filter)
// is exercised deterministically regardless of the test host's env.
vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();

  return {
    ...actual,
    IS_CLOUD: true,
  };
});

import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

/**
 * Contract tests for the Replicate integration (revenue path).
 *
 * These pin the request shape sent to the Replicate SDK and the response shape
 * the service expects back — the seam where a provider API change silently
 * breaks production generation. The `replicate` client is fully mocked; no
 * network calls are made. Fixtures cover success responses and representative
 * provider-error responses.
 *
 * To update when Replicate changes its API: adjust the `predictions.create` /
 * `trainings.create` argument assertions and the response fixtures below.
 */
describe('ReplicateService (contract)', () => {
  let service: ReplicateService;

  const buildService = async () => {
    const configMock = {
      get: vi.fn((key?: string) => {
        switch (key) {
          case 'REPLICATE_KEY':
            return 'mock-api-key';
          case 'GENFEEDAI_WEBHOOKS_URL':
            return 'https://webhook.test';
          case 'REPLICATE_MODELS_TRAINER':
            return 'replicate/fast-flux-trainer:f463fbfc97389e10a2f443a8a84b6953b1058eafbf0c9af4d84457ff07cb04db';
          case 'REPLICATE_MODEL_VISIBILITY':
            return 'private';
          case 'REPLICATE_MODEL_HARDWARE':
            return 'gpu-t4';
          default:
            return '';
        }
      }),
    };

    const loggerMock = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      verbose: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReplicateService,
        { provide: ConfigService, useValue: configMock },
        { provide: LoggerService, useValue: loggerMock },
      ],
    }).compile();

    return {
      logger: loggerMock,
      service: module.get<ReplicateService>(ReplicateService),
    };
  };

  afterEach(() => vi.clearAllMocks());

  describe('runModel — prediction request/response contract', () => {
    it('sends { input, version, webhook, webhook_events_filter } and returns the prediction id', async () => {
      const built = await buildService();
      service = built.service;

      const predictionsCreate = vi
        .fn()
        // Success fixture: Replicate returns a prediction object with an id.
        .mockResolvedValue({ id: 'pred_abc123', status: 'starting' });
      service.client = {
        predictions: { create: predictionsCreate },
      } as unknown as typeof service.client;

      const input = { num_outputs: 1, prompt: 'a neon city' };
      const id = await service.runModel('owner/model:v1', input);

      expect(id).toBe('pred_abc123');
      expect(predictionsCreate).toHaveBeenCalledTimes(1);
      expect(predictionsCreate).toHaveBeenCalledWith({
        input,
        version: 'owner/model:v1',
        webhook: 'https://webhook.test/v1/webhooks/replicate/callback',
        webhook_events_filter: ['completed'],
      });
    });

    it('rethrows and logs when Replicate rejects (e.g. 422 invalid version)', async () => {
      const built = await buildService();
      service = built.service;

      // Failure fixture: Replicate 422 for an invalid model version.
      const providerError = Object.assign(new Error('Invalid version'), {
        status: 422,
        detail: 'The specified version does not exist',
      });
      service.client = {
        predictions: { create: vi.fn().mockRejectedValue(providerError) },
      } as unknown as typeof service.client;

      await expect(
        service.runModel('owner/model:bad', { prompt: 'x' }),
      ).rejects.toThrow('Invalid version');
      expect(built.logger.error).toHaveBeenCalled();
    });
  });

  describe('getPrediction — poll response contract', () => {
    it('returns the raw prediction object from predictions.get', async () => {
      const built = await buildService();
      service = built.service;

      // Success fixture: a completed prediction with an output url array.
      const prediction = {
        id: 'pred_abc123',
        output: ['https://replicate.delivery/out/0.png'],
        status: 'succeeded',
      };
      const predictionsGet = vi.fn().mockResolvedValue(prediction);
      service.client = {
        predictions: { get: predictionsGet },
      } as unknown as typeof service.client;

      const result = await service.getPrediction('pred_abc123');

      expect(predictionsGet).toHaveBeenCalledWith('pred_abc123');
      expect(result).toEqual(prediction);
    });
  });

  describe('runTraining — training request/response contract', () => {
    it('splits owner/model/version and returns the training id on success', async () => {
      const built = await buildService();
      service = built.service;

      const trainingsCreate = vi
        .fn()
        .mockResolvedValue({ id: 'train_123', status: 'starting' });
      service.client = {
        trainings: { create: trainingsCreate },
      } as unknown as typeof service.client;

      const destination = 'genfeedai/model-name' as `${string}/${string}`;
      const input = {
        input_images: 'https://example.com/training.zip',
        training_steps: 1000,
        trigger_word: 'TOK',
      };

      const id = await service.runTraining(destination, input);

      expect(id).toBe('train_123');
      expect(trainingsCreate).toHaveBeenCalledWith(
        'replicate',
        'fast-flux-trainer',
        'f463fbfc97389e10a2f443a8a84b6953b1058eafbf0c9af4d84457ff07cb04db',
        expect.objectContaining({
          destination,
          input,
          webhook: 'https://webhook.test/v1/webhooks/replicate/callback',
          webhook_events_filter: ['completed'],
        }),
      );
    });

    it('creates the destination model then retries on a 404 destination-missing error', async () => {
      const built = await buildService();
      service = built.service;

      // Failure fixture: Replicate 404 because the destination model is absent.
      const missing = Object.assign(
        new Error('The specified training destination does not exist'),
        { status: 404 },
      );
      const trainingsCreate = vi
        .fn()
        .mockRejectedValueOnce(missing)
        .mockResolvedValueOnce({ id: 'train_456' });
      const modelsCreate = vi.fn().mockResolvedValue({});
      service.client = {
        models: { create: modelsCreate },
        trainings: { create: trainingsCreate },
      } as unknown as typeof service.client;

      const id = await service.runTraining(
        'genfeedai/model-name' as `${string}/${string}`,
        {
          input_images: 'https://example.com/training.zip',
          training_steps: 1000,
          trigger_word: 'TOK',
        },
      );

      expect(modelsCreate).toHaveBeenCalledWith(
        'genfeedai',
        'model-name',
        expect.objectContaining({ hardware: 'gpu-t4', visibility: 'private' }),
      );
      expect(trainingsCreate).toHaveBeenCalledTimes(2);
      expect(id).toBe('train_456');
    });

    it('rethrows non-destination provider errors (e.g. 429 rate limit) without retrying', async () => {
      const built = await buildService();
      service = built.service;

      // Failure fixture: Replicate 429 rate limit — not recoverable by
      // creating a model, so the service must surface it, not silently retry.
      const rateLimited = Object.assign(new Error('Too many requests'), {
        status: 429,
      });
      const trainingsCreate = vi.fn().mockRejectedValue(rateLimited);
      const modelsCreate = vi.fn();
      service.client = {
        models: { create: modelsCreate },
        trainings: { create: trainingsCreate },
      } as unknown as typeof service.client;

      await expect(
        service.runTraining('genfeedai/model-name' as `${string}/${string}`, {
          input_images: 'https://example.com/training.zip',
          training_steps: 1000,
          trigger_word: 'TOK',
        }),
      ).rejects.toThrow('Too many requests');
      expect(modelsCreate).not.toHaveBeenCalled();
      expect(trainingsCreate).toHaveBeenCalledTimes(1);
    });
  });
});
