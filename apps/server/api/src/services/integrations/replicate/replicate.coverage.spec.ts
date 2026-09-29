vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();

  return {
    ...actual,
    isCloudDeployment: () => false,
  };
});

import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MockClient = {
  models?: { create: ReturnType<typeof vi.fn> };
  predictions?: {
    create: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
  trainings?: { create: ReturnType<typeof vi.fn> };
  wait?: ReturnType<typeof vi.fn>;
};

function makeClient(overrides: Partial<MockClient> = {}): MockClient {
  return {
    models: { create: vi.fn().mockResolvedValue({}) },
    predictions: {
      create: vi.fn().mockResolvedValue({ id: 'pred_default' }),
      get: vi
        .fn()
        .mockResolvedValue({ id: 'pred_default', status: 'succeeded' }),
    },
    trainings: { create: vi.fn().mockResolvedValue({ id: 'train_default' }) },
    wait: vi.fn().mockResolvedValue({ id: 'pred_default', output: 'result' }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('ReplicateService (coverage)', () => {
  let service: ReplicateService;
  let mockLoggerService: vi.Mocked<LoggerService>;
  let mockConfigService: Partial<ConfigService> & {
    get: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockConfigService = {
      get: vi.fn((key?: string) => {
        switch (key) {
          case 'REPLICATE_KEY':
            return 'mock-api-key';
          case 'GENFEEDAI_WEBHOOKS_URL':
            return 'https://webhook.test';
          case 'REPLICATE_MODELS_TRAINER':
            return 'replicate/fast-flux-trainer:abc123hash';
          case 'REPLICATE_MODEL_VISIBILITY':
            return 'private';
          case 'REPLICATE_MODEL_HARDWARE':
            return 'gpu-t4';
          case 'REPLICATE_TARGET_FPS':
            return '60';
          case 'REPLICATE_TARGET_RESOLUTION':
            return '1080p';
          case 'REPLICATE_OWNER':
            return '';
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
    } as unknown as vi.Mocked<LoggerService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReplicateService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<ReplicateService>(ReplicateService);
  });

  // -------------------------------------------------------------------------
  // runModel
  // -------------------------------------------------------------------------

  describe('runModel', () => {
    it('creates prediction and returns the prediction id', async () => {
      const client = makeClient({
        predictions: {
          create: vi.fn().mockResolvedValue({ id: 'pred_abc' }),
          get: vi.fn(),
        },
      });
      service.client = client as unknown as typeof service.client;

      const id = await service.runModel('owner/model:version', {
        prompt: 'test',
      });

      expect(id).toBe('pred_abc');
      expect(client.predictions?.create).toHaveBeenCalledWith(
        expect.objectContaining({
          input: { prompt: 'test' },
          version: 'version',
        }),
      );
    });

    it('propagates errors and logs them', async () => {
      const err = new Error('replicate error');
      service.client = makeClient({
        predictions: {
          create: vi.fn().mockRejectedValue(err),
          get: vi.fn(),
        },
      }) as unknown as typeof service.client;

      await expect(service.runModel('v', {})).rejects.toThrow(
        'replicate error',
      );
      expect(mockLoggerService.error).toHaveBeenCalled();
    });

    it('uses a fresh Replicate client when apiKeyOverride is supplied', async () => {
      // We cannot easily inspect the internal Replicate constructor call, but we
      // can confirm predictions.create is called on the NEW client (not the
      // singleton stored on service.client) by intentionally poisoning the
      // singleton and verifying the call still succeeds via the override path.
      //
      // Replace the module-level Replicate constructor with a factory spy.
      const overrideCreate = vi.fn().mockResolvedValue({ id: 'pred_override' });
      const originalClient = service.client;

      // Poison the singleton so it would throw if called
      service.client = {
        predictions: {
          create: vi.fn().mockRejectedValue(new Error('singleton used')),
          get: vi.fn(),
        },
      } as unknown as typeof service.client;

      // Patch getClientForRequest (private) via prototype to return a client
      // that uses overrideCreate.
      const overrideClient: MockClient = makeClient({
        predictions: { create: overrideCreate, get: vi.fn() },
      });

      const spy = vi
        .spyOn(
          service as unknown as {
            getClientForRequest: (k?: string) => unknown;
          },
          'getClientForRequest',
        )
        .mockReturnValue(
          overrideClient as unknown as ReturnType<
            (typeof service)['client']['predictions']['create']
          >,
        );

      const id = await service.runModel('v', { x: 1 }, 'override-key');

      expect(id).toBe('pred_override');
      expect(spy).toHaveBeenCalledWith('override-key');

      spy.mockRestore();
      service.client = originalClient;
    });
  });

  // -------------------------------------------------------------------------
  // runTraining — error branches not covered by existing spec
  // -------------------------------------------------------------------------

  describe('runTraining — uncovered branches', () => {
    it('throws (and logs) when trainings.create fails with a non-404 error', async () => {
      const err = new Error('Rate limit exceeded');
      service.client = makeClient({
        trainings: { create: vi.fn().mockRejectedValue(err) },
      }) as unknown as typeof service.client;

      await expect(
        service.runTraining('owner/model', {
          input_images: 'https://x.com/t.zip',
          training_steps: 100,
          trigger_word: 'TOK',
        }),
      ).rejects.toThrow('Rate limit exceeded');
      expect(mockLoggerService.error).toHaveBeenCalled();
    });

    it('triggers destination retry when error message contains "destination"', async () => {
      const err = new Error('destination does not exist');
      const create = vi
        .fn()
        .mockRejectedValueOnce(err)
        .mockResolvedValueOnce({ id: 'train_retry' });
      const modelsCreate = vi.fn().mockResolvedValue({});
      service.client = makeClient({
        models: { create: modelsCreate },
        trainings: { create },
      }) as unknown as typeof service.client;

      const id = await service.runTraining('dest/model', {
        input_images: 'https://x.com/t.zip',
        training_steps: 100,
        trigger_word: 'TOK',
      });

      expect(modelsCreate).toHaveBeenCalledTimes(1);
      expect(id).toBe('train_retry');
    });

    it('triggers destination retry when error detail contains "destination"', async () => {
      const err = Object.assign(new Error('API error'), {
        detail: 'The destination model does not exist',
        status: 422,
      });
      const create = vi
        .fn()
        .mockRejectedValueOnce(err)
        .mockResolvedValueOnce({ id: 'train_detail_retry' });
      const modelsCreate = vi.fn().mockResolvedValue({});
      service.client = makeClient({
        models: { create: modelsCreate },
        trainings: { create },
      }) as unknown as typeof service.client;

      const id = await service.runTraining('myorg/mymodel', {
        input_images: 'https://x.com/t.zip',
        training_steps: 200,
        trigger_word: 'STYLE',
      });

      expect(modelsCreate).toHaveBeenCalledTimes(1);
      expect(id).toBe('train_detail_retry');
    });

    it('uses trainerVersion override when provided', async () => {
      const create = vi.fn().mockResolvedValue({ id: 'train_custom' });
      service.client = makeClient({
        trainings: { create },
      }) as unknown as typeof service.client;

      const id = await service.runTraining(
        'org/model',
        {
          input_images: 'https://x.com/t.zip',
          training_steps: 50,
          trigger_word: 'TOK',
        },
        'customowner/custommodel:customhash',
      );

      expect(id).toBe('train_custom');
      expect(create).toHaveBeenCalledWith(
        'customowner',
        'custommodel',
        'customhash',
        expect.anything(),
      );
    });

    it('throws if the retry itself fails', async () => {
      const retryErr = new Error('retry failed too');
      const create = vi
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error('msg'), { status: 404 }))
        .mockRejectedValueOnce(retryErr);
      const modelsCreate = vi.fn().mockResolvedValue({});
      service.client = makeClient({
        models: { create: modelsCreate },
        trainings: { create },
      }) as unknown as typeof service.client;

      await expect(
        service.runTraining('org/model', {
          input_images: 'https://x.com/t.zip',
          training_steps: 10,
          trigger_word: 'X',
        }),
      ).rejects.toThrow('retry failed too');
    });
  });

  // -------------------------------------------------------------------------
  // getPrediction
  // -------------------------------------------------------------------------

  describe('getPrediction', () => {
    it('returns prediction object for given id', async () => {
      const prediction = {
        id: 'pred_get',
        output: ['url'],
        status: 'succeeded',
      };
      const get = vi.fn().mockResolvedValue(prediction);
      service.client = makeClient({
        predictions: { create: vi.fn(), get },
      }) as unknown as typeof service.client;

      const result = await service.getPrediction('pred_get');

      expect(result).toEqual(prediction);
      expect(get).toHaveBeenCalledWith('pred_get');
    });

    it('propagates error and logs on failure', async () => {
      const err = new Error('not found');
      service.client = makeClient({
        predictions: {
          create: vi.fn(),
          get: vi.fn().mockRejectedValue(err),
        },
      }) as unknown as typeof service.client;

      await expect(service.getPrediction('bad_id')).rejects.toThrow(
        'not found',
      );
      expect(mockLoggerService.error).toHaveBeenCalled();
    });

    it('accepts apiKeyOverride (delegates to getClientForRequest)', async () => {
      const get = vi.fn().mockResolvedValue({ id: 'pred_ov' });
      const overrideClient = makeClient({
        predictions: { create: vi.fn(), get },
      });
      const spy = vi
        .spyOn(
          service as unknown as {
            getClientForRequest: (k?: string) => unknown;
          },
          'getClientForRequest',
        )
        .mockReturnValue(
          overrideClient as unknown as ReturnType<
            (typeof service)['client']['predictions']['create']
          >,
        );

      const result = await service.getPrediction('pred_ov', 'my-override-key');

      expect(result).toEqual({ id: 'pred_ov' });
      expect(spy).toHaveBeenCalledWith('my-override-key');
      spy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // generateImageToVideo / generateTextToVideo / generateTextToImage /
  // enhanceVideo / generateTextCompletion — all delegate to runModel
  // -------------------------------------------------------------------------

  describe('delegation wrappers', () => {
    it('generateImageToVideo delegates to runModel', async () => {
      const spy = vi.spyOn(service, 'runModel').mockResolvedValue('pred_i2v');

      const id = await service.generateImageToVideo('owner/model:v', {
        video: 'url',
      });

      expect(id).toBe('pred_i2v');
      expect(spy).toHaveBeenCalledWith(
        'owner/model:v',
        { video: 'url' },
        undefined,
      );
    });

    it('generateTextToVideo delegates to runModel', async () => {
      const spy = vi.spyOn(service, 'runModel').mockResolvedValue('pred_t2v');

      const id = await service.generateTextToVideo('owner/model:v', {
        prompt: 'fly',
      });

      expect(id).toBe('pred_t2v');
      expect(spy).toHaveBeenCalledWith(
        'owner/model:v',
        { prompt: 'fly' },
        undefined,
      );
    });

    it('generateTextToImage delegates to runModel', async () => {
      const spy = vi.spyOn(service, 'runModel').mockResolvedValue('pred_t2i');

      const id = await service.generateTextToImage('owner/model:v', {
        prompt: 'cat',
      });

      expect(id).toBe('pred_t2i');
      expect(spy).toHaveBeenCalledWith(
        'owner/model:v',
        { prompt: 'cat' },
        undefined,
      );
    });

    it('generateTextCompletion delegates to runModel', async () => {
      const spy = vi.spyOn(service, 'runModel').mockResolvedValue('pred_llm');

      const id = await service.generateTextCompletion('meta/llama', {
        prompt: 'hello',
      });

      expect(id).toBe('pred_llm');
      expect(spy).toHaveBeenCalledWith(
        'meta/llama',
        { prompt: 'hello' },
        undefined,
      );
    });

    it('enhanceVideo calls runModel with upscale version and config values', async () => {
      const spy = vi
        .spyOn(service, 'runModel')
        .mockResolvedValue('pred_enhance');

      const id = await service.enhanceVideo('https://cdn.example.com/clip.mp4');

      expect(id).toBe('pred_enhance');
      expect(spy).toHaveBeenCalledWith(
        'topazlabs/video-upscale',
        expect.objectContaining({
          target_fps: '60',
          target_resolution: '1080p',
          video: 'https://cdn.example.com/clip.mp4',
        }),
        undefined,
      );
    });
  });

  // -------------------------------------------------------------------------
  // generateTextCompletionSync
  // -------------------------------------------------------------------------

  describe('generateTextCompletionSync', () => {
    it('creates prediction, waits, and joins array output', async () => {
      const wait = vi
        .fn()
        .mockResolvedValue({ id: 'pred_sync', output: ['Hello', ' world'] });
      const create = vi
        .fn()
        .mockResolvedValue({ id: 'pred_sync', version: 'v' });
      service.client = makeClient({
        predictions: { create, get: vi.fn() },
        wait,
      }) as unknown as typeof service.client;

      const text = await service.generateTextCompletionSync('meta/llama:v', {
        prompt: 'hi',
      });

      expect(text).toBe('Hello world');
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          input: { prompt: 'hi' },
          version: 'v',
        }),
      );
      expect(wait).toHaveBeenCalledWith({ id: 'pred_sync', version: 'v' });
    });

    it('propagates error and logs on failure', async () => {
      const err = new Error('llm failed');
      service.client = makeClient({
        predictions: { create: vi.fn().mockRejectedValue(err), get: vi.fn() },
      }) as unknown as typeof service.client;

      await expect(service.generateTextCompletionSync('v', {})).rejects.toThrow(
        'llm failed',
      );
      expect(mockLoggerService.error).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getAspectRatio
  // -------------------------------------------------------------------------

  describe('getAspectRatio', () => {
    it('calculates 1:2 for 450:1000 (ratio 0.45 is within 0.1 of 0.5)', () => {
      // 9/20=0.45 → |0.45-9/16|=0.1125 (miss), |0.45-1|=0.55 (miss), ... |0.45-0.5|=0.05 < 0.1 → 1:2
      expect(service.getAspectRatio(450, 1000)).toBe('1:2');
    });
  });

  // -------------------------------------------------------------------------
  // parseReplicateInput — uncovered branches
  // -------------------------------------------------------------------------

  describe('parseReplicateInput — uncovered branches', () => {
    it('wraps prompt in JSON for non-VEO google models without speech field', () => {
      const input = service.parseReplicateInput('google/veo-2', {
        height: 1080,
        prompt: 'test video',
        width: 1920,
      });

      const parsed = JSON.parse(input.prompt as string) as Record<
        string,
        unknown
      >;
      expect(parsed.prompt).toBe('test video');
      expect(
        (parsed.elements as Record<string, unknown>).speech,
      ).toBeUndefined();
    });

    it('preserves other params outside the prompt for google models', () => {
      const input = service.parseReplicateInput('google/veo-3', {
        duration: 5,
        height: 1080,
        prompt: 'clip',
        width: 1920,
      });

      // Non-prompt fields should still be present on the input object
      expect(input.height).toBe(1080);
      expect(input.width).toBe(1920);
      expect(input.duration).toBe(5);
    });

    it('does not transform input for non-google, non-owned models', () => {
      mockConfigService.get.mockImplementation(() => '');

      const params = { guidance_scale: 7.5, prompt: 'a cat' };
      const input = service.parseReplicateInput('stability-ai/sdxl', params);

      expect(input.prompt).toBe('a cat');
      expect(input.guidance_scale).toBe(7.5);
      expect(input.num_outputs).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // transcribeAudio
  // -------------------------------------------------------------------------

  describe('transcribeAudio', () => {
    const whisperOutput = {
      language: 'en',
      segments: [
        { end: 2.5, start: 0, text: 'Hello world' },
        { end: 5.0, start: 2.5, text: 'How are you' },
      ],
      text: 'Hello world How are you',
    };

    it('transcribes from a URL input', async () => {
      const wait = vi
        .fn()
        .mockResolvedValue({ id: 'pred_asr', output: whisperOutput });
      const create = vi.fn().mockResolvedValue({ id: 'pred_asr' });
      service.client = makeClient({
        predictions: { create, get: vi.fn() },
        wait,
      }) as unknown as typeof service.client;

      const result = await service.transcribeAudio({
        audio: { type: 'url', url: 'https://cdn.example.com/audio.mp3' },
      });

      expect(result.text).toBe('Hello world How are you');
      expect(result.language).toBe('en');
      expect(result.duration).toBe(5.0);
      expect(result.segments).toHaveLength(2);
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            audio: 'https://cdn.example.com/audio.mp3',
          }),
          model: 'openai/whisper',
        }),
      );
    });

    it('transcribes from a Buffer input (mp3) and converts to data URI', async () => {
      const wait = vi.fn().mockResolvedValue({
        id: 'pred_buf',
        output: { language: 'fr', segments: [], text: 'Bonjour' },
      });
      const create = vi.fn().mockResolvedValue({ id: 'pred_buf' });
      service.client = makeClient({
        predictions: { create, get: vi.fn() },
        wait,
      }) as unknown as typeof service.client;

      const audioBuffer = Buffer.from('fake-audio-data');
      const result = await service.transcribeAudio({
        audio: { data: audioBuffer, filename: 'clip.mp3', type: 'buffer' },
      });

      expect(result.text).toBe('Bonjour');
      const callInput = (create.mock.calls[0][0] as Record<string, unknown>)
        .input as Record<string, unknown>;
      expect(typeof callInput.audio).toBe('string');
      expect(
        (callInput.audio as string).startsWith('data:audio/mpeg;base64,'),
      ).toBe(true);
    });

    it('uses "unknown" for language and empty string for text when output fields are missing', async () => {
      const wait = vi.fn().mockResolvedValue({
        id: 'pred_empty_out',
        output: {},
      });
      service.client = makeClient({
        predictions: {
          create: vi.fn().mockResolvedValue({ id: 'pred_empty_out' }),
          get: vi.fn(),
        },
        wait,
      }) as unknown as typeof service.client;

      const result = await service.transcribeAudio({
        audio: { type: 'url', url: 'https://cdn.example.com/a.mp3' },
      });

      expect(result.language).toBe('unknown');
      expect(result.text).toBe('');
    });

    it('propagates network error and logs', async () => {
      const err = new Error('network failure');
      service.client = makeClient({
        predictions: { create: vi.fn().mockRejectedValue(err), get: vi.fn() },
      }) as unknown as typeof service.client;

      await expect(
        service.transcribeAudio({
          audio: { type: 'url', url: 'https://cdn.example.com/a.mp3' },
        }),
      ).rejects.toThrow('network failure');
      expect(mockLoggerService.error).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // IS_CLOUD = true — webhook attached
  // -------------------------------------------------------------------------
});
