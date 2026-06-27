import {
  pollReplicatePrediction,
  registerWorkflowExecutors,
} from '@api/services/telegram-bot/telegram-workflow-executors';
import { describe, expect, it, vi } from 'vitest';

type Executor = (
  node: { id: string; config: Record<string, unknown> },
  inputs: Map<string, unknown>,
  ctx: unknown,
) => Promise<unknown>;

function buildEngine() {
  const executors = new Map<string, Executor>();
  const engine = {
    registerExecutor: (name: string, fn: Executor) => {
      executors.set(name, fn);
    },
  } as unknown as Parameters<typeof registerWorkflowExecutors>[0];
  return { engine, executors };
}

const logger = {
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
} as unknown as Parameters<
  typeof registerWorkflowExecutors
>[1]['loggerService'];

describe('registerWorkflowExecutors', () => {
  it('registers passthrough executors with the original semantics', async () => {
    const { engine, executors } = buildEngine();
    registerWorkflowExecutors(engine, {
      loggerService: logger,
      replicateService: {} as never,
    });

    // imageInput / telegramInput require an image and forward it
    await expect(
      executors.get('imageInput')?.({ config: {}, id: 'n1' }, new Map(), {}),
    ).rejects.toThrow('No image provided for node n1');
    await expect(
      executors.get('telegramInput')?.(
        { config: { image: 'u' }, id: 'n2' },
        new Map(),
        {},
      ),
    ).resolves.toEqual({ image: 'u' });

    // prompt requires text and forwards it under the `text` key
    await expect(
      executors.get('prompt')?.({ config: {}, id: 'n3' }, new Map(), {}),
    ).rejects.toThrow('No prompt provided for node n3');
    await expect(
      executors.get('prompt')?.(
        { config: { prompt: 'hello' }, id: 'n4' },
        new Map(),
        {},
      ),
    ).resolves.toEqual({ text: 'hello' });

    // audioInput / videoInput forward their field without throwing
    await expect(
      executors.get('audioInput')?.(
        { config: { audio: 'a' }, id: 'n5' },
        new Map(),
        {},
      ),
    ).resolves.toEqual({ audio: 'a' });
    await expect(
      executors.get('videoInput')?.(
        { config: { video: 'v' }, id: 'n6' },
        new Map(),
        {},
      ),
    ).resolves.toEqual({ video: 'v' });
  });

  it('routes imageGen to fal.ai when a fal model is configured', async () => {
    const { engine, executors } = buildEngine();
    const falService = {
      generateImage: vi.fn().mockResolvedValue({ url: 'fal-url' }),
      isConfigured: () => true,
    };
    registerWorkflowExecutors(engine, {
      falService: falService as never,
      loggerService: logger,
      replicateService: { runModel: vi.fn() } as never,
    });

    const result = await executors.get('imageGen')?.(
      { config: { model: 'fal-flux-dev' }, id: 'g' },
      new Map(),
      {},
    );

    expect(result).toEqual({ image: 'fal-url', provider: 'fal' });
    expect(falService.generateImage).toHaveBeenCalledWith(
      'fal-ai/flux/dev',
      expect.objectContaining({ prompt: '' }),
    );
  });

  it('routes imageGen to Replicate with the mapped model id', async () => {
    const { engine, executors } = buildEngine();
    const replicateService = {
      getPrediction: vi
        .fn()
        .mockResolvedValue({ output: 'img-url', status: 'succeeded' }),
      runModel: vi.fn().mockResolvedValue('pred-1'),
    };
    registerWorkflowExecutors(engine, {
      loggerService: logger,
      replicateService: replicateService as never,
    });

    const result = await executors.get('imageGen')?.(
      { config: { model: 'nano-banana-pro' }, id: 'g' },
      new Map(),
      {},
    );

    expect(replicateService.runModel).toHaveBeenCalledWith(
      'google/nano-banana-pro',
      expect.objectContaining({ aspect_ratio: '1:1' }),
    );
    expect(result).toEqual({ image: 'img-url', predictionId: 'pred-1' });
  });

  it('forwards all inputs through the output executor', async () => {
    const { engine, executors } = buildEngine();
    registerWorkflowExecutors(engine, {
      loggerService: logger,
      replicateService: {} as never,
    });

    const inputs = new Map<string, unknown>([
      ['a', { image: 'i' }],
      ['b', { video: 'v' }],
    ]);
    await expect(
      executors.get('output')?.({ config: {}, id: 'o' }, inputs, {}),
    ).resolves.toEqual({ image: 'i', video: 'v' });
  });
});

describe('pollReplicatePrediction', () => {
  it('returns the output when the prediction succeeds', async () => {
    const replicateService = {
      getPrediction: vi
        .fn()
        .mockResolvedValue({ output: 'done', status: 'succeeded' }),
    };
    await expect(
      pollReplicatePrediction(replicateService as never, 'pred'),
    ).resolves.toBe('done');
  });

  it('throws when the prediction fails', async () => {
    const replicateService = {
      getPrediction: vi
        .fn()
        .mockResolvedValue({ error: 'boom', status: 'failed' }),
    };
    await expect(
      pollReplicatePrediction(replicateService as never, 'pred'),
    ).rejects.toThrow('Prediction failed: boom');
  });
});
