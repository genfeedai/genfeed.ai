import type { ImageGenerationProviderRequest } from '@api/collections/images/services/image-generation.types';
import { ReplicateImageGenerationProviderAdapter } from '@api/collections/images/services/providers/replicate-image-generation-provider.adapter';
import { GenerationCancelledError } from '@api/collections/ingredients/errors/generation-cancelled.error';
import type { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const configState = { canReceiveWebhooks: false, isCloud: false };

vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();

  return {
    ...actual,
    canReceiveProviderWebhooks: () => configState.canReceiveWebhooks,
    isCloudDeployment: () => configState.isCloud,
  };
});

interface Prediction {
  apiKey?: string;
  canceledWithKey?: string;
  endpoint: string;
  input: Record<string, unknown>;
  output: unknown;
  polledWith: (string | undefined)[];
  status: string;
}

const OUTPUT = ['https://cdn.test/out.png'];

function buildRequest(
  overrides: Partial<ImageGenerationProviderRequest> = {},
): ImageGenerationProviderRequest {
  return {
    createImageDto: {},
    height: 1024,
    model: 'replicate/some-model',
    outputs: 1,
    prompt: 'a cinematic still',
    providerInput: { prompt: 'a cinematic still' },
    width: 1024,
    ...overrides,
  } as unknown as ImageGenerationProviderRequest;
}

describe('ReplicateImageGenerationProviderAdapter', () => {
  let predictions: Map<string, Prediction>;
  let nextOutput: unknown;
  let adapter: ReplicateImageGenerationProviderAdapter;

  const run = async (overrides: Partial<ImageGenerationProviderRequest> = {}) =>
    (await adapter.prepare(buildRequest(overrides))).generate();

  beforeEach(() => {
    configState.canReceiveWebhooks = false;
    configState.isCloud = false;
    predictions = new Map();
    nextOutput = OUTPUT;

    // Replicate: a prediction is readable and cancellable only with the key
    // that created it, and finishes on its first read.
    const owned = (id: string, apiKey?: string) => {
      const prediction = predictions.get(id);
      if (!prediction || prediction.apiKey !== apiKey) {
        throw new Error(`401 for ${id}`);
      }
      return prediction;
    };
    const replicate = {
      cancelPrediction: async (id: string, apiKey?: string) => {
        Object.assign(owned(id, apiKey), {
          canceledWithKey: apiKey,
          status: 'canceled',
        });
      },
      generateTextToImage: async (
        endpoint: string,
        input: Record<string, unknown>,
        apiKey?: string,
      ) => {
        const id = `pred-${predictions.size + 1}`;
        predictions.set(id, {
          apiKey,
          endpoint,
          input,
          output: null,
          polledWith: [],
          status: 'starting',
        });
        return id;
      },
      getPrediction: async (id: string, apiKey?: string) => {
        const prediction = owned(id, apiKey);
        Object.assign(prediction, {
          output: nextOutput,
          polledWith: [...prediction.polledWith, apiKey],
          status: 'succeeded',
        });
        return { output: prediction.output, status: prediction.status };
      },
    } as unknown as ReplicateService;

    adapter = new ReplicateImageGenerationProviderAdapter(replicate);
  });

  it('runs a platform prediction locally and polls it for the outputs', async () => {
    await expect(run()).resolves.toEqual({
      externalId: 'pred-1',
      kind: 'external-id',
      outputUrls: OUTPUT,
    });
    expect(predictions.get('pred-1')).toMatchObject({
      apiKey: undefined,
      endpoint: 'replicate/some-model',
      input: { prompt: 'a cinematic still' },
      polledWith: [undefined],
    });
  });

  it('sends the FLUX.3 edit row to the model Replicate actually hosts', async () => {
    await run({
      model: 'black-forest-labs/flux-3-image-edit',
      modelEndpoint: 'black-forest-labs/flux-3-image-edit',
    });

    expect(predictions.get('pred-1')?.endpoint).toBe(
      'black-forest-labs/flux-3-image',
    );
  });

  it.each([
    ['locally', false],
    ['on cloud, where no platform webhook is registered', true],
  ])(
    'runs and polls a BYOK prediction with the org key %s',
    async (_case, isCloud) => {
      configState.canReceiveWebhooks = isCloud;
      configState.isCloud = isCloud;

      await expect(
        run({ apiKeyOverride: 'org-replicate-key' }),
      ).resolves.toMatchObject({ outputUrls: OUTPUT });
      expect(predictions.get('pred-1')).toMatchObject({
        apiKey: 'org-replicate-key',
        polledWith: ['org-replicate-key'],
      });
    },
  );

  it('leaves a platform prediction to the webhook on cloud', async () => {
    configState.canReceiveWebhooks = true;
    configState.isCloud = true;

    await expect(run()).resolves.toEqual({
      externalId: 'pred-1',
      kind: 'external-id',
    });
    expect(predictions.get('pred-1')).toMatchObject({
      polledWith: [],
      status: 'starting',
    });
  });

  it('cancels an aborted BYOK prediction with the same org key', async () => {
    const abortController = new AbortController();
    abortController.abort();

    await expect(
      run({
        abortSignal: abortController.signal,
        apiKeyOverride: 'org-replicate-key',
      }),
    ).rejects.toBeInstanceOf(GenerationCancelledError);
    expect(predictions.get('pred-1')).toMatchObject({
      canceledWithKey: 'org-replicate-key',
      polledWith: [],
      status: 'canceled',
    });
  });

  it.each([
    { images: OUTPUT },
    [...OUTPUT, { url: 'https://cdn.test/layer.png' }],
  ])(
    'keeps the raw succeeded result before rejecting unsupported output (%s)',
    async (output) => {
      nextOutput = output;
      const persisted: unknown[] = [];

      await expect(
        run({
          onProviderOutput: async (raw) => {
            persisted.push(raw);
          },
        }),
      ).rejects.toThrow('without an output URL');
      expect(persisted).toEqual([output]);
    },
  );
});
