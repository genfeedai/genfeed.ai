import { ManagedInferenceProvider } from '@api/endpoints/v1/managed-inference/dto/managed-inference-request.dto';
import { VideoTaskModel } from '@genfeedai/enums';
import { GenerateVideoTask } from '@workers/crons/workflows/task-types/generate-video.task';

describe('GenerateVideoTask', () => {
  const klingaiService = {
    generateTextToVideo: vi.fn(),
  };
  const replicateService = {
    runModel: vi.fn(),
  };
  const falService = {
    generateVideo: vi.fn(),
  };
  const higgsFieldService = {
    generateImageToVideo: vi.fn(),
    waitForCompletion: vi.fn(),
  };
  const fleetService = {
    generateVideo: vi.fn(),
    pollJob: vi.fn(),
  };
  const byokService = {
    resolveApiKey: vi.fn(),
  };
  const byokProviderFactoryService = {
    resolveProvider: vi.fn(),
  };
  const managedInferenceClientService = {
    generateVideo: vi.fn(),
  };
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  let task: GenerateVideoTask;

  beforeEach(() => {
    vi.clearAllMocks();
    task = new GenerateVideoTask(
      klingaiService as never,
      replicateService as never,
      falService as never,
      higgsFieldService as never,
      fleetService as never,
      byokService as never,
      byokProviderFactoryService as never,
      managedInferenceClientService as never,
      logger as never,
    );
  });

  it('routes unavailable local ComfyUI video through managed genfeedai provider', async () => {
    fleetService.generateVideo.mockResolvedValue(null);
    byokProviderFactoryService.resolveProvider.mockResolvedValue({
      apiKey: 'gf_live_managed',
      managedInferenceUrl: 'https://api.genfeed.ai/v1/managed-inference',
      source: 'managed',
    });
    managedInferenceClientService.generateVideo.mockResolvedValue(
      'https://video.test/managed.mp4',
    );

    const result = await task.execute(
      {
        imageUrl: 'https://img.test/source.jpg',
        model: VideoTaskModel.COMFYUI,
        prompt: 'cinematic pan',
      },
      'user-1',
      'org-1',
    );

    expect(result.success).toBe(true);
    expect(result.videoId).toBe('https://video.test/managed.mp4');
    expect(managedInferenceClientService.generateVideo).toHaveBeenCalledWith({
      apiKey: 'gf_live_managed',
      endpointUrl: 'https://api.genfeed.ai/v1/managed-inference',
      input: expect.objectContaining({
        imageUrl: 'https://img.test/source.jpg',
        prompt: 'cinematic pan',
      }),
      model: VideoTaskModel.COMFYUI,
      provider: ManagedInferenceProvider.GENFEEDAI,
    });
  });

  it('routes managed fal video requests through the managed inference bridge', async () => {
    byokProviderFactoryService.resolveProvider.mockResolvedValue({
      apiKey: 'gf_live_managed',
      managedInferenceUrl: 'https://api.genfeed.ai/v1/managed-inference',
      source: 'managed',
    });
    managedInferenceClientService.generateVideo.mockResolvedValue(
      'https://video.test/fal.mp4',
    );

    const result = await task.execute(
      {
        model: VideoTaskModel.FAL,
        prompt: 'text to video',
      },
      'user-1',
      'org-1',
    );

    expect(result.success).toBe(true);
    expect(result.videoId).toBe('https://video.test/fal.mp4');
    expect(managedInferenceClientService.generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'fal-ai/kling-video/v1/standard/text-to-video',
        provider: ManagedInferenceProvider.FAL,
      }),
    );
    expect(falService.generateVideo).not.toHaveBeenCalled();
  });
});
