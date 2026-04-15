vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();

  return {
    ...actual,
    IS_CLOUD: false,
  };
});

import { ConfigService } from '@api/config/config.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('ReplicateService', () => {
  let service: ReplicateService;
  let mockLoggerService: vi.Mocked<LoggerService>;
  let mockConfigService: Partial<ConfigService> & { get: vi.Mock };

  beforeEach(async () => {
    mockConfigService = {
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

    mockLoggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      verbose: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReplicateService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<ReplicateService>(ReplicateService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('runTraining', () => {
    it('calls trainings.create with parsed owner/model/version and returns id', async () => {
      const trainingsCreate = vi.fn().mockResolvedValue({ id: 'train_123' });
      service.client = { trainings: { create: trainingsCreate } };

      const destination = 'genfeedai/model-name';
      const input = {
        input_images: 'https://example.com/training.zip',
        training_steps: 1000,
        trigger_word: 'TOK',
      };

      const id = await service.runTraining(destination, input);

      expect(id).toBe('train_123');
      expect(trainingsCreate).toHaveBeenCalledTimes(1);
      expect(trainingsCreate).toHaveBeenCalledWith(
        'replicate',
        'fast-flux-trainer',
        'f463fbfc97389e10a2f443a8a84b6953b1058eafbf0c9af4d84457ff07cb04db',
        expect.objectContaining({
          destination,
          input,
        }),
      );
    });

    it('creates destination model on 404 then retries', async () => {
      const err = Object.assign(
        new Error('The specified training destination does not exist'),
        { status: 404 },
      );
      const trainingsCreate = vi
        .fn()
        .mockRejectedValueOnce(err)
        .mockResolvedValueOnce({ id: 'train_456' });
      const modelsCreate = vi.fn().mockResolvedValue({});

      service.client = {
        models: { create: modelsCreate },
        trainings: { create: trainingsCreate },
      };

      const destination = 'genfeedai/model-name';
      const input = {
        input_images: 'https://example.com/training.zip',
        training_steps: 1000,
        trigger_word: 'TOK',
      };

      const id = await service.runTraining(destination, input);

      expect(modelsCreate).toHaveBeenCalledWith(
        'genfeedai',
        'model-name',
        expect.objectContaining({ hardware: 'gpu-t4', visibility: 'private' }),
      );
      expect(trainingsCreate).toHaveBeenCalledTimes(2);
      expect(id).toBe('train_456');
    });
  });

  describe('parseReplicateInput', () => {
    it('includes num_outputs when provided for trained models', () => {
      mockConfigService.get.mockImplementation((key?: string) => {
        if (key === 'REPLICATE_OWNER') {
          return 'genfeedai';
        }
        return 'value';
      });

      const model = 'genfeedai/my-model';
      const params: Record<string, unknown> = { outputs: 3, prompt: 'test' };

      const input = service.parseReplicateInput(model, params);

      expect(input.num_outputs).toBe(3);
    });

    it('includes speech in jsonPrompt.elements for VEO-3 when speech is provided', () => {
      const model = 'google/veo-3';
      const params: Record<string, unknown> = {
        height: 1080,
        prompt: 'test video',
        speech: 'Hello world',
        width: 1920,
      };

      const input = service.parseReplicateInput(model, params);

      const parsedPrompt = JSON.parse(input.prompt as string);
      expect(parsedPrompt.elements.speech).toBe('Hello world');
    });

    it('includes speech in jsonPrompt.elements for VEO-3 FAST when speech is provided', () => {
      const model = 'google/veo-3-fast';
      const params: Record<string, unknown> = {
        height: 1080,
        prompt: 'test video',
        speech: 'Testing speech',
        width: 1920,
      };

      const input = service.parseReplicateInput(model, params);

      const parsedPrompt = JSON.parse(input.prompt as string);
      expect(parsedPrompt.elements.speech).toBe('Testing speech');
    });

    it('excludes speech from jsonPrompt.elements when speech is empty string', () => {
      const model = 'google/veo-3';
      const params: Record<string, unknown> = {
        height: 1080,
        prompt: 'test video',
        speech: '   ',
        width: 1920,
      };

      const input = service.parseReplicateInput(model, params);

      const parsedPrompt = JSON.parse(input.prompt as string);
      expect(parsedPrompt.elements.speech).toBeUndefined();
    });

    it('excludes speech from jsonPrompt.elements for non-VEO-3 models', () => {
      const model = 'google/veo-2';
      const params: Record<string, unknown> = {
        height: 1080,
        prompt: 'test video',
        speech: 'Hello world',
        width: 1920,
      };

      const input = service.parseReplicateInput(model, params);

      const parsedPrompt = JSON.parse(input.prompt as string);
      expect(parsedPrompt.elements.speech).toBeUndefined();
    });

    it('trims speech whitespace before adding to jsonPrompt.elements', () => {
      const model = 'google/veo-3-fast';
      const params: Record<string, unknown> = {
        height: 1080,
        prompt: 'test video',
        speech: '  Trimmed speech  ',
        width: 1920,
      };

      const input = service.parseReplicateInput(model, params);

      const parsedPrompt = JSON.parse(input.prompt as string);
      expect(parsedPrompt.elements.speech).toBe('Trimmed speech');
    });
  });
});
