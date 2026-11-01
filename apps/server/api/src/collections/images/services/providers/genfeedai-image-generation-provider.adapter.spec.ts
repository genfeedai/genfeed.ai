import type { ImageGenerationProviderRequest } from '@api/collections/images/services/image-generation.types';
import { GenfeedAiImageGenerationProviderAdapter } from '@api/collections/images/services/providers/genfeedai-image-generation-provider.adapter';
import type { ComfyUIService } from '@api/services/integrations/comfyui/comfyui.service';
import type { ManagedInferenceRuntimeService } from '@api/services/integrations/managed-inference-runtime/managed-inference-runtime.service';
import type { MediaUrlService } from '@api/services/media-urls/media-url.service';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';

const { mockedAxiosGet } = vi.hoisted(() => ({ mockedAxiosGet: vi.fn() }));

vi.mock('axios', () => ({ default: { get: mockedAxiosGet } }));

const request = {
  createImageDto: { loraPath: 'customers/acme.safetensors', seed: 7 },
  height: 1216,
  model: MODEL_KEYS.GENFEED_AI_Z_IMAGE_TURBO_LORA,
  organizationId: 'org-1',
  prompt: 'a product shot',
  referenceImageUrl: null,
  width: 832,
} as unknown as ImageGenerationProviderRequest;

function buildAdapter(options: {
  runtimeUrl: string | null;
  isComfyConfigured: boolean;
}) {
  const runtime = {
    generateImage: vi.fn().mockResolvedValue({
      jobId: 'job-1',
      resultUrl: 'https://cdn.genfeed.ai/ingredients/images/job-1.png',
    }),
    getInstanceUrlForOrg: vi.fn().mockResolvedValue(options.runtimeUrl),
  };
  const comfy = {
    generateImage: vi.fn().mockResolvedValue({
      filename: 'out.png',
      imageBuffer: Buffer.from('comfy-image'),
    }),
    isConfigured: vi.fn().mockReturnValue(options.isComfyConfigured),
  };
  const mediaUrls = {
    buildUrlFromAbsolute: vi.fn((url: string) => `${url}?signed=1`),
  };
  const adapter = new GenfeedAiImageGenerationProviderAdapter(
    runtime as unknown as ManagedInferenceRuntimeService,
    comfy as unknown as ComfyUIService,
    mediaUrls as unknown as MediaUrlService,
  );
  return { adapter, comfy, runtime };
}

async function generate(adapter: GenfeedAiImageGenerationProviderAdapter) {
  const provider = await adapter.prepare(request);
  return provider.generate();
}

describe('GenfeedAiImageGenerationProviderAdapter', () => {
  beforeEach(() => {
    mockedAxiosGet.mockReset();
    mockedAxiosGet.mockResolvedValue({ data: Buffer.from('runtime-image') });
  });

  it('runs on the images runtime and returns the downloaded image', async () => {
    const { adapter, runtime } = buildAdapter({
      isComfyConfigured: true,
      runtimeUrl: 'http://images.fleet.local',
    });

    const result = await generate(adapter);

    expect(result).toEqual({
      imageBuffer: Buffer.from('runtime-image'),
      kind: 'inline-buffer',
    });
    expect(runtime.generateImage).toHaveBeenCalledWith({
      height: 1216,
      loraPath: 'customers/acme.safetensors',
      model: MODEL_KEYS.GENFEED_AI_Z_IMAGE_TURBO_LORA,
      organizationId: 'org-1',
      prompt: 'a product shot',
      seed: 7,
      width: 832,
    });
    expect(mockedAxiosGet).toHaveBeenCalledWith(
      'https://cdn.genfeed.ai/ingredients/images/job-1.png?signed=1',
      expect.objectContaining({ responseType: 'arraybuffer' }),
    );
  });

  it('uses the self-hosted ComfyUI server when no runtime is configured', async () => {
    const { adapter } = buildAdapter({
      isComfyConfigured: true,
      runtimeUrl: null,
    });

    await expect(generate(adapter)).resolves.toEqual({
      imageBuffer: Buffer.from('comfy-image'),
      kind: 'inline-buffer',
    });
  });

  it('fails with a configuration message when neither is configured', async () => {
    const { adapter } = buildAdapter({
      isComfyConfigured: false,
      runtimeUrl: null,
    });

    await expect(generate(adapter)).rejects.toThrow(
      'Genfeed AI image models need GPU_IMAGES_URL or COMFYUI_URL to be configured',
    );
  });
});
