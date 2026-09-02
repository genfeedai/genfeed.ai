import { isCloudDeployment } from '@genfeedai/config';
import { CONTEXT_EMBEDDING_DIMENSION } from '@genfeedai/contracts/constants';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import Replicate from 'replicate';
import { ReplicateService } from './replicate.service';

vi.mock('@genfeedai/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/config')>()),
  isCloudDeployment: vi.fn(() => false),
}));

const predictionsCreate = vi.fn();
const predictionsGet = vi.fn();
const predictionsCancel = vi.fn();
const trainingsCreate = vi.fn();
const modelsCreate = vi.fn();
const wait = vi.fn();
const constructed: Array<{ auth?: string }> = [];

// Vitest 4 requires a `function`-style constructor mock — an arrow function
// cannot be invoked with `new`.
vi.mock('replicate', () => ({
  default: vi.fn(function MockReplicate(this: unknown, options: unknown) {
    constructed.push(options as { auth?: string });
    Object.assign(this as object, {
      models: { create: modelsCreate },
      predictions: {
        cancel: predictionsCancel,
        create: predictionsCreate,
        get: predictionsGet,
      },
      trainings: { create: trainingsCreate },
      wait,
    });
  }),
}));

const isCloudMock = vi.mocked(isCloudDeployment);

const CONFIG: Record<string, string> = {
  GENFEEDAI_WEBHOOKS_URL: 'https://hooks.test',
  REPLICATE_KEY: 'env-key',
  REPLICATE_MODELS_TRAINER: 'replicate/fast-flux-trainer:trainer-hash',
  REPLICATE_OWNER: 'acme',
  REPLICATE_TARGET_FPS: '60',
  REPLICATE_TARGET_RESOLUTION: '4k',
};

function createHarness(overrides: Record<string, string | undefined> = {}) {
  const values = { ...CONFIG, ...overrides };
  const configService = {
    get: vi.fn((key: string) => values[key]),
  } as unknown as ConfigService;
  const loggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;

  return {
    configService,
    loggerService,
    service: new ReplicateService(configService, loggerService),
  };
}

describe('ReplicateService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    constructed.length = 0;
    isCloudMock.mockReturnValue(false);
    predictionsCreate.mockResolvedValue({ id: 'pred-1' });
    predictionsGet.mockResolvedValue({ id: 'pred-1', status: 'succeeded' });
    predictionsCancel.mockResolvedValue({ id: 'pred-1', status: 'canceled' });
    trainingsCreate.mockResolvedValue({ id: 'train-1' });
    modelsCreate.mockResolvedValue({});
    wait.mockImplementation(async (prediction) => prediction);
  });

  describe('construction', () => {
    it('eagerly builds a client with the configured key', () => {
      createHarness();

      expect(Replicate).toHaveBeenCalledTimes(1);
      expect(constructed[0]).toEqual({ auth: 'env-key' });
    });
  });

  describe('runModel', () => {
    it('sends an owner/model slug through the model field', async () => {
      const { service } = createHarness();

      await expect(
        service.runModel('black-forest-labs/flux', { prompt: 'hi' }),
      ).resolves.toBe('pred-1');

      expect(predictionsCreate).toHaveBeenCalledWith({
        input: { prompt: 'hi' },
        model: 'black-forest-labs/flux',
      });
    });

    it('prefers the immutable version when the identifier carries one', async () => {
      const { service } = createHarness();

      await service.runModel('owner/model:abc123', {});

      expect(predictionsCreate).toHaveBeenCalledWith({
        input: {},
        version: 'abc123',
      });
    });

    it('treats a bare identifier as a version id', async () => {
      const { service } = createHarness();

      await service.runModel('abc123', {});

      expect(predictionsCreate).toHaveBeenCalledWith({
        input: {},
        version: 'abc123',
      });
    });

    it('falls back to the model slug when the version segment is empty', async () => {
      const { service } = createHarness();

      await service.runModel('owner/model:', {});

      expect(predictionsCreate).toHaveBeenCalledWith({
        input: {},
        model: 'owner/model:',
      });
    });

    it('registers a completion webhook on cloud deployments with a public base URL', async () => {
      isCloudMock.mockReturnValue(true);
      const { service } = createHarness();

      await service.runModel('owner/model', {});

      expect(predictionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          webhook: 'https://hooks.test/v1/webhooks/replicate/callback',
          webhook_events_filter: ['completed'],
        }),
      );
    });

    it('binds a workflow continuation identity into the completion webhook', async () => {
      isCloudMock.mockReturnValue(true);
      const { service } = createHarness();

      await service.runModel('owner/model', {}, undefined, 'continuation/1');

      expect(predictionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          webhook:
            'https://hooks.test/v1/webhooks/replicate/callback?workflowContinuationId=continuation%2F1',
        }),
      );
    });

    it('omits the webhook off-cloud', async () => {
      const { service } = createHarness();

      await service.runModel('owner/model', {});

      expect(predictionsCreate.mock.calls[0][0]).not.toHaveProperty('webhook');
    });

    it('omits the webhook on local cloud (unreachable Portless host)', async () => {
      isCloudMock.mockReturnValue(true);
      const { loggerService, service } = createHarness({
        GENFEEDAI_WEBHOOKS_URL: 'https://api.genfeed.localhost',
      });

      await service.runModel('owner/model', {});

      expect(predictionsCreate.mock.calls[0][0]).not.toHaveProperty('webhook');
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('skipping Replicate webhook'),
        expect.objectContaining({
          webhooksBase: 'https://api.genfeed.localhost',
        }),
      );
    });

    it('builds a per-request client when an api key override is supplied', async () => {
      const { service } = createHarness();
      constructed.length = 0;

      await service.runModel('owner/model', {}, 'byok-key');

      expect(constructed).toEqual([{ auth: 'byok-key' }]);
    });

    it('logs and rethrows a prediction failure', async () => {
      const { loggerService, service } = createHarness();
      predictionsCreate.mockRejectedValueOnce(new Error('boom'));

      await expect(service.runModel('owner/model', {})).rejects.toThrow('boom');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('thin generation wrappers', () => {
    it.each([
      ['generateImageToVideo', 'owner/i2v'],
      ['generateTextToVideo', 'owner/t2v'],
      ['generateTextToImage', 'owner/t2i'],
      ['generateTextCompletion', 'owner/llm'],
    ] as const)('%s delegates to runModel', async (method, model) => {
      const { service } = createHarness();

      await expect(service[method](model, { prompt: 'x' })).resolves.toBe(
        'pred-1',
      );
      expect(predictionsCreate).toHaveBeenCalledWith({
        input: { prompt: 'x' },
        model,
      });
    });

    it('enhanceVideo passes the configured upscale settings', async () => {
      const { service } = createHarness();

      await service.enhanceVideo('https://cdn.test/a.mp4');

      expect(predictionsCreate).toHaveBeenCalledWith({
        input: {
          target_fps: '60',
          target_resolution: '4k',
          video: 'https://cdn.test/a.mp4',
        },
        model: 'topazlabs/video-upscale',
      });
    });
  });

  describe('getPrediction', () => {
    it('returns the remote prediction', async () => {
      const { service } = createHarness();

      await expect(service.getPrediction('pred-1')).resolves.toEqual({
        id: 'pred-1',
        status: 'succeeded',
      });
      expect(predictionsGet).toHaveBeenCalledWith('pred-1');
    });

    it('logs and rethrows a lookup failure', async () => {
      const { loggerService, service } = createHarness();
      predictionsGet.mockRejectedValueOnce(new Error('gone'));

      await expect(service.getPrediction('pred-1')).rejects.toThrow('gone');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('cancelPrediction', () => {
    it('cancels the prediction on the Replicate client', async () => {
      const { service } = createHarness();

      await expect(service.cancelPrediction('pred-1')).resolves.toBeUndefined();
      expect(predictionsCancel).toHaveBeenCalledWith('pred-1');
    });

    it('logs and rethrows a cancel failure', async () => {
      const { loggerService, service } = createHarness();
      predictionsCancel.mockRejectedValueOnce(new Error('already ended'));

      await expect(service.cancelPrediction('pred-1')).rejects.toThrow(
        'already ended',
      );
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('runTraining', () => {
    it('splits the configured trainer into owner, model and version', async () => {
      const { service } = createHarness();

      await expect(
        service.runTraining('acme/lora', {
          input_images: 'https://cdn.test/images.zip',
          training_steps: 1000,
          trigger_word: 'TOK',
        }),
      ).resolves.toBe('train-1');

      expect(trainingsCreate).toHaveBeenCalledWith(
        'replicate',
        'fast-flux-trainer',
        'trainer-hash',
        expect.objectContaining({ destination: 'acme/lora' }),
      );
    });

    it('honours an explicit trainer version', async () => {
      const { service } = createHarness();

      await service.runTraining(
        'acme/lora',
        { input_images: 'x', training_steps: 1, trigger_word: 'TOK' },
        'other/trainer:v9',
      );

      expect(trainingsCreate).toHaveBeenCalledWith(
        'other',
        'trainer',
        'v9',
        expect.any(Object),
      );
    });

    it('adds the webhook on cloud deployments', async () => {
      isCloudMock.mockReturnValue(true);
      const { service } = createHarness();

      await service.runTraining('acme/lora', {
        input_images: 'x',
        training_steps: 1,
        trigger_word: 'TOK',
      });

      expect(trainingsCreate).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          webhook: 'https://hooks.test/v1/webhooks/replicate/callback',
          webhook_events_filter: ['completed'],
        }),
      );
    });

    it('creates the destination model and retries on a 404', async () => {
      const { loggerService, service } = createHarness();
      trainingsCreate
        .mockRejectedValueOnce(
          Object.assign(new Error('nope'), { status: 404 }),
        )
        .mockResolvedValueOnce({ id: 'train-2' });

      await expect(
        service.runTraining('acme/lora', {
          input_images: 'x',
          training_steps: 1,
          trigger_word: 'TOK',
        }),
      ).resolves.toBe('train-2');

      expect(modelsCreate).toHaveBeenCalledWith('acme', 'lora', {
        hardware: 'gpu-t4',
        visibility: 'private',
      });
      expect(loggerService.warn).toHaveBeenCalled();
    });

    it('retries when the error message mentions the destination', async () => {
      const { service } = createHarness();
      trainingsCreate
        .mockRejectedValueOnce(new Error('destination does not exist'))
        .mockResolvedValueOnce({ id: 'train-2' });

      await expect(
        service.runTraining('acme/lora', {
          input_images: 'x',
          training_steps: 1,
          trigger_word: 'TOK',
        }),
      ).resolves.toBe('train-2');
    });

    it('retries when the API detail mentions the destination', async () => {
      const { service } = createHarness();
      trainingsCreate
        .mockRejectedValueOnce({ detail: 'Invalid destination' })
        .mockResolvedValueOnce({ id: 'train-2' });

      await expect(
        service.runTraining('acme/lora', {
          input_images: 'x',
          training_steps: 1,
          trigger_word: 'TOK',
        }),
      ).resolves.toBe('train-2');
    });

    it('uses configured hardware and visibility when creating the destination', async () => {
      const { service } = createHarness({
        REPLICATE_MODEL_HARDWARE: 'gpu-a100',
        REPLICATE_MODEL_VISIBILITY: 'public',
      });
      trainingsCreate
        .mockRejectedValueOnce(Object.assign(new Error('x'), { status: 404 }))
        .mockResolvedValueOnce({ id: 'train-2' });

      await service.runTraining('acme/lora', {
        input_images: 'x',
        training_steps: 1,
        trigger_word: 'TOK',
      });

      expect(modelsCreate).toHaveBeenCalledWith('acme', 'lora', {
        hardware: 'gpu-a100',
        visibility: 'public',
      });
    });

    it('rethrows an unrelated training failure without creating a model', async () => {
      const { service } = createHarness();
      trainingsCreate.mockRejectedValue(new Error('quota exceeded'));

      await expect(
        service.runTraining('acme/lora', {
          input_images: 'x',
          training_steps: 1,
          trigger_word: 'TOK',
        }),
      ).rejects.toThrow('quota exceeded');

      expect(modelsCreate).not.toHaveBeenCalled();
    });
  });

  describe('generateTextCompletionSync', () => {
    it('joins an array output into a single string', async () => {
      const { service } = createHarness();
      wait.mockResolvedValueOnce({ id: 'pred-1', output: ['Hel', 'lo'] });

      await expect(
        service.generateTextCompletionSync('owner/llm', { prompt: 'hi' }),
      ).resolves.toBe('Hello');
    });

    it('stringifies a scalar output', async () => {
      const { service } = createHarness();
      wait.mockResolvedValueOnce({ id: 'pred-1', output: 'done' });

      await expect(
        service.generateTextCompletionSync('owner/llm', {}),
      ).resolves.toBe('done');
    });

    it('returns an empty string for a null output', async () => {
      const { service } = createHarness();
      wait.mockResolvedValueOnce({ id: 'pred-1', output: null });

      await expect(
        service.generateTextCompletionSync('owner/llm', {}),
      ).resolves.toBe('');
    });

    it('never registers a webhook for the synchronous path', async () => {
      isCloudMock.mockReturnValue(true);
      const { service } = createHarness();

      await service.generateTextCompletionSync('owner/llm', {});

      expect(predictionsCreate.mock.calls[0][0]).not.toHaveProperty('webhook');
    });

    it('logs and rethrows a failure', async () => {
      const { loggerService, service } = createHarness();
      wait.mockRejectedValueOnce(new Error('timeout'));

      await expect(
        service.generateTextCompletionSync('owner/llm', {}),
      ).rejects.toThrow('timeout');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('generateEmbedding', () => {
    const vector = Array.from(
      { length: CONTEXT_EMBEDDING_DIMENSION },
      () => 0.1,
    );

    it('sends the text as a JSON array and returns a flat vector', async () => {
      const { service } = createHarness();
      wait.mockResolvedValueOnce({ id: 'pred-1', output: vector });

      await expect(
        service.generateEmbedding('owner/embed', 'hello'),
      ).resolves.toEqual(vector);

      expect(predictionsCreate).toHaveBeenCalledWith({
        input: { texts: JSON.stringify(['hello']) },
        model: 'owner/embed',
      });
    });

    it('unwraps a nested single-vector output', async () => {
      const { service } = createHarness();
      wait.mockResolvedValueOnce({ id: 'pred-1', output: [vector] });

      await expect(
        service.generateEmbedding('owner/embed', 'hello'),
      ).resolves.toEqual(vector);
    });

    it('rejects a vector of the wrong width', async () => {
      const { service } = createHarness();
      wait.mockResolvedValueOnce({ id: 'pred-1', output: [1, 2, 3] });

      await expect(
        service.generateEmbedding('owner/embed', 'hello'),
      ).rejects.toThrow(
        `returned 3 dimensions; expected ${CONTEXT_EMBEDDING_DIMENSION}`,
      );
    });

    it('rejects a non-numeric output', async () => {
      const { service } = createHarness();
      wait.mockResolvedValueOnce({ id: 'pred-1', output: 'not a vector' });

      await expect(
        service.generateEmbedding('owner/embed', 'hello'),
      ).rejects.toThrow('returned 0 dimensions');
    });

    it('rejects a vector containing a non-finite component', async () => {
      const { service } = createHarness();
      wait.mockResolvedValueOnce({
        id: 'pred-1',
        output: [...vector.slice(1), Number.NaN],
      });

      await expect(
        service.generateEmbedding('owner/embed', 'hello'),
      ).rejects.toThrow('expected');
    });
  });

  describe('getAspectRatio', () => {
    it('defaults to landscape when a dimension is missing', () => {
      const { service } = createHarness();

      expect(service.getAspectRatio()).toBe('16:9');
      expect(service.getAspectRatio(1024, 0)).toBe('16:9');
    });

    it('uses the exact lookup table when available', () => {
      const { service } = createHarness();

      expect(service.getAspectRatio(1024, 1024)).toBe('1:1');
      expect(service.getAspectRatio(1920, 1080)).toBe('16:9');
      expect(service.getAspectRatio(1024, 2048)).toBe('1:2');
    });

    it.each([
      [800, 800, '1:1'],
      [3200, 1800, '16:9'],
      [1800, 3200, '9:16'],
      [800, 600, '4:3'],
      [600, 800, '3:4'],
      [3000, 1500, '2:1'],
    ])('maps %ix%i to %s', (width, height, expected) => {
      const { service } = createHarness();

      expect(service.getAspectRatio(width, height)).toBe(expected);
    });

    // The computed 9:16 test (0.5625 +/- 0.1 => [0.4625, 0.6625]) fully
    // contains the computed 1:2 test (0.5 +/- 0.1 => [0.4, 0.6]) and runs
    // first, so a computed 1:2 is unreachable. Only the exact lookup table
    // entry (1024x2048) can ever produce '1:2'.
    it('resolves a computed 1:2 ratio as 9:16', () => {
      const { service } = createHarness();

      expect(service.getAspectRatio(1500, 3000)).toBe('9:16');
    });

    it('falls back to orientation for an unusual ratio', () => {
      const { service } = createHarness();

      expect(service.getAspectRatio(1000, 300)).toBe('16:9');
      expect(service.getAspectRatio(300, 1000)).toBe('9:16');
    });
  });

  describe('parseReplicateInput', () => {
    it('passes ordinary params through untouched', () => {
      const { service } = createHarness();

      expect(
        service.parseReplicateInput('other/model', { prompt: 'x' }),
      ).toEqual({ prompt: 'x' });
    });

    it('maps outputs to num_outputs for owned models', () => {
      const { service } = createHarness();

      expect(
        service.parseReplicateInput('acme/trained', {
          outputs: 4,
          prompt: 'x',
        }),
      ).toEqual({ num_outputs: 4, outputs: 4, prompt: 'x' });
    });

    it('does not add num_outputs for a foreign model', () => {
      const { service } = createHarness();

      expect(
        service.parseReplicateInput('other/model', { outputs: 4 }),
      ).not.toHaveProperty('num_outputs');
    });

    it('does not add num_outputs when outputs is absent', () => {
      const { service } = createHarness();

      expect(
        service.parseReplicateInput('acme/trained', { prompt: 'x' }),
      ).not.toHaveProperty('num_outputs');
    });

    it('wraps a Google model prompt as JSON with elements', () => {
      const { service } = createHarness();

      const input = service.parseReplicateInput('google/imagen', {
        prompt: 'a cat',
      });

      expect(JSON.parse(String(input.prompt))).toEqual({
        elements: {},
        prompt: 'a cat',
      });
    });

    it('carries speech into the elements block for VEO-3', () => {
      const { service } = createHarness();

      const input = service.parseReplicateInput('google/veo-3', {
        prompt: 'a cat',
        speech: '  hello  ',
      });

      expect(JSON.parse(String(input.prompt))).toEqual({
        elements: { speech: 'hello' },
        prompt: 'a cat',
      });
    });

    it('omits blank speech for VEO-3-fast', () => {
      const { service } = createHarness();

      const input = service.parseReplicateInput('google/veo-3-fast', {
        prompt: 'a cat',
        speech: '   ',
      });

      expect(JSON.parse(String(input.prompt)).elements).toEqual({});
    });
  });

  describe('transcribeAudio', () => {
    it('sends a url input straight through', async () => {
      const { service } = createHarness();
      wait.mockResolvedValueOnce({
        id: 'pred-1',
        output: { language: 'en', text: 'hello there' },
      });

      const result = await service.transcribeAudio({
        audio: { type: 'url', url: 'https://cdn.test/a.mp3' },
      });

      expect(predictionsCreate).toHaveBeenCalledWith({
        input: { audio: 'https://cdn.test/a.mp3' },
        model: 'openai/whisper',
      });
      expect(result).toEqual({
        confidence: undefined,
        duration: 0,
        language: 'en',
        segments: undefined,
        text: 'hello there',
      });
    });

    it('encodes a buffer as a data URI using the filename mime type', async () => {
      const { service } = createHarness();
      wait.mockResolvedValueOnce({ id: 'pred-1', output: {} });

      await service.transcribeAudio({
        audio: {
          data: Buffer.from('abc'),
          filename: 'clip.WAV',
          type: 'buffer',
        },
      });

      expect(predictionsCreate.mock.calls[0][0].input.audio).toBe(
        `data:audio/wav;base64,${Buffer.from('abc').toString('base64')}`,
      );
    });

    it('defaults to audio/mpeg for an unknown extension', async () => {
      const { service } = createHarness();
      wait.mockResolvedValueOnce({ id: 'pred-1', output: {} });

      await service.transcribeAudio({
        audio: {
          data: Buffer.from('abc'),
          filename: 'clip.xyz',
          type: 'buffer',
        },
      });

      expect(predictionsCreate.mock.calls[0][0].input.audio).toContain(
        'data:audio/mpeg;base64,',
      );
    });

    it('rejects a buffer request with no data', async () => {
      const { service } = createHarness();

      await expect(
        service.transcribeAudio({ audio: { type: 'buffer' } }),
      ).rejects.toThrow('Buffer data is required for buffer type');
    });

    it('rejects a url request with no url', async () => {
      const { service } = createHarness();

      await expect(
        service.transcribeAudio({ audio: { type: 'url' } }),
      ).rejects.toThrow('URL is required for url type');
    });

    it('forwards an explicit language and prompt', async () => {
      const { service } = createHarness();
      wait.mockResolvedValueOnce({ id: 'pred-1', output: {} });

      await service.transcribeAudio({
        audio: { type: 'url', url: 'https://cdn.test/a.mp3' },
        language: 'fr',
        prompt: 'context',
      });

      expect(predictionsCreate.mock.calls[0][0].input).toEqual({
        audio: 'https://cdn.test/a.mp3',
        initial_prompt: 'context',
        language: 'fr',
      });
    });

    it('omits the language parameter when set to auto', async () => {
      const { service } = createHarness();
      wait.mockResolvedValueOnce({ id: 'pred-1', output: {} });

      await service.transcribeAudio({
        audio: { type: 'url', url: 'https://cdn.test/a.mp3' },
        language: 'auto',
      });

      expect(predictionsCreate.mock.calls[0][0].input).not.toHaveProperty(
        'language',
      );
    });

    it('derives the duration from the last segment', async () => {
      const { service } = createHarness();
      wait.mockResolvedValueOnce({
        id: 'pred-1',
        output: {
          segments: [
            { end: 2, start: 0, text: 'a' },
            { end: 7.5, start: 2, text: 'b' },
          ],
          text: 'ab',
        },
      });

      const result = await service.transcribeAudio({
        audio: { type: 'url', url: 'https://cdn.test/a.mp3' },
      });

      expect(result.duration).toBe(7.5);
      expect(result.segments).toHaveLength(2);
    });

    it('defaults missing transcript fields', async () => {
      const { service } = createHarness();
      wait.mockResolvedValueOnce({ id: 'pred-1', output: {} });

      const result = await service.transcribeAudio({
        audio: { type: 'url', url: 'https://cdn.test/a.mp3' },
      });

      expect(result.language).toBe('unknown');
      expect(result.text).toBe('');
    });

    it('logs and rethrows a transcription failure', async () => {
      const { loggerService, service } = createHarness();
      predictionsCreate.mockRejectedValueOnce(new Error('whisper down'));

      await expect(
        service.transcribeAudio({
          audio: { type: 'url', url: 'https://cdn.test/a.mp3' },
        }),
      ).rejects.toThrow('whisper down');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });
});
