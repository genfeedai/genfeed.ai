import type { ImageGenerationProviderRequest } from '@api/collections/images/services/image-generation.types';
import { ReplicateImageGenerationProviderAdapter } from '@api/collections/images/services/providers/replicate-image-generation-provider.adapter';
import type { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';

const configState = { canReceiveWebhooks: false, isCloud: false };

vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();

  return {
    ...actual,
    canReceiveProviderWebhooks: () => configState.canReceiveWebhooks,
    isCloudDeployment: () => configState.isCloud,
  };
});

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

describe('ReplicateImageGenerationProviderAdapter BYOK dispatch key (#5294)', () => {
  beforeEach(() => {
    configState.canReceiveWebhooks = false;
    configState.isCloud = false;
  });

  it('dispatches with no override when the org is not BYOK-active', async () => {
    const replicateService = {
      generateTextToImage: vi.fn().mockResolvedValue('pred_platform'),
      getPrediction: vi.fn().mockResolvedValue({
        output: ['https://cdn.test/out.png'],
        status: 'succeeded',
      }),
    };
    const adapter = new ReplicateImageGenerationProviderAdapter(
      replicateService as unknown as ReplicateService,
    );

    const prepared = await adapter.prepare(buildRequest());
    await prepared.generate();

    expect(replicateService.generateTextToImage).toHaveBeenCalledWith(
      'replicate/some-model',
      { prompt: 'a cinematic still' },
      undefined,
    );
    expect(replicateService.getPrediction).toHaveBeenCalledWith(
      'pred_platform',
      undefined,
    );
  });

  it('forwards the resolved BYOK apiKeyOverride to generation and to local polling', async () => {
    const replicateService = {
      generateTextToImage: vi.fn().mockResolvedValue('pred_byok'),
      getPrediction: vi.fn().mockResolvedValue({
        output: ['https://cdn.test/out.png'],
        status: 'succeeded',
      }),
    };
    const adapter = new ReplicateImageGenerationProviderAdapter(
      replicateService as unknown as ReplicateService,
    );

    const prepared = await adapter.prepare(
      buildRequest({ apiKeyOverride: 'org-replicate-key' }),
    );
    await prepared.generate();

    expect(replicateService.generateTextToImage).toHaveBeenCalledWith(
      'replicate/some-model',
      { prompt: 'a cinematic still' },
      'org-replicate-key',
    );
    expect(replicateService.getPrediction).toHaveBeenCalledWith(
      'pred_byok',
      'org-replicate-key',
    );
  });

  it('polls a BYOK prediction with the org key on cloud, where no platform webhook is registered', async () => {
    configState.canReceiveWebhooks = true;
    configState.isCloud = true;
    const replicateService = {
      generateTextToImage: vi.fn().mockResolvedValue('pred_byok_cloud'),
      getPrediction: vi.fn().mockResolvedValue({
        output: ['https://cdn.test/out.png'],
        status: 'succeeded',
      }),
    };
    const adapter = new ReplicateImageGenerationProviderAdapter(
      replicateService as unknown as ReplicateService,
    );

    const prepared = await adapter.prepare(
      buildRequest({ apiKeyOverride: 'org-replicate-key' }),
    );
    const result = await prepared.generate();

    expect(replicateService.getPrediction).toHaveBeenCalledWith(
      'pred_byok_cloud',
      'org-replicate-key',
    );
    expect(result).toEqual(
      expect.objectContaining({ outputUrls: ['https://cdn.test/out.png'] }),
    );
  });

  it('leaves a platform prediction to the webhook on cloud', async () => {
    configState.canReceiveWebhooks = true;
    configState.isCloud = true;
    const replicateService = {
      generateTextToImage: vi.fn().mockResolvedValue('pred_platform_cloud'),
      getPrediction: vi.fn(),
    };
    const adapter = new ReplicateImageGenerationProviderAdapter(
      replicateService as unknown as ReplicateService,
    );

    const prepared = await adapter.prepare(buildRequest());
    await prepared.generate();

    expect(replicateService.getPrediction).not.toHaveBeenCalled();
  });

  it('cancels an aborted BYOK prediction with the same org key', async () => {
    const abortController = new AbortController();
    const replicateService = {
      cancelPrediction: vi.fn().mockResolvedValue(undefined),
      generateTextToImage: vi.fn().mockResolvedValue('pred_byok_cancel'),
      getPrediction: vi.fn(),
    };
    const adapter = new ReplicateImageGenerationProviderAdapter(
      replicateService as unknown as ReplicateService,
    );
    abortController.abort();

    const prepared = await adapter.prepare(
      buildRequest({
        abortSignal: abortController.signal,
        apiKeyOverride: 'org-replicate-key',
      }),
    );

    await expect(prepared.generate()).rejects.toThrow();
    expect(replicateService.cancelPrediction).toHaveBeenCalledWith(
      'pred_byok_cancel',
      'org-replicate-key',
    );
    expect(replicateService.getPrediction).not.toHaveBeenCalled();
  });
});
