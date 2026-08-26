import { ManagedInferenceProvider } from '@api/endpoints/v1/managed-inference/dto/managed-inference-request.dto';
import * as generationBrief from '@api/services/generation-brief';
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

  afterEach(() => {
    vi.restoreAllMocks();
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

  it.each([
    {
      aspectRatio: '16:9' as const,
      expectedHeight: 2160,
      expectedWidth: 3840,
      resolution: '4k' as const,
    },
    {
      aspectRatio: '9:16' as const,
      expectedHeight: 1920,
      expectedWidth: 1080,
      resolution: '1080p' as const,
    },
    {
      aspectRatio: '1:1' as const,
      expectedHeight: 720,
      expectedWidth: 720,
      resolution: '720p' as const,
    },
  ])(
    'compiles scheduled $resolution $aspectRatio video with $expectedWidth x $expectedHeight dimensions and retains provenance',
    async ({ aspectRatio, expectedHeight, expectedWidth, resolution }) => {
      const evidence = {
        compilerId: null,
        compilerVersion: null,
        modelKey: VideoTaskModel.KLINGAI,
        profileId: null,
        profileVersion: null,
        reason: 'legacy_prompt_builder' as const,
        status: 'exempted' as const,
        surface: 'schedule' as const,
      };
      const runVideoGenerationBrief = vi
        .spyOn(generationBrief, 'runVideoGenerationBrief')
        .mockReturnValue({
          evidence,
          generationSource: 'generation-brief-exemption:legacy_prompt_builder',
        });
      byokService.resolveApiKey.mockResolvedValue(undefined);
      klingaiService.generateTextToVideo.mockResolvedValue(
        'https://video.test/kling.mp4',
      );

      const result = await task.execute(
        {
          aspectRatio,
          model: VideoTaskModel.KLINGAI,
          prompt: 'cinematic product reveal',
          resolution,
        },
        'user-1',
        'org-1',
      );

      expect(runVideoGenerationBrief).toHaveBeenCalledWith(
        expect.objectContaining({
          height: expectedHeight,
          surface: 'schedule',
          width: expectedWidth,
        }),
      );
      expect(result.metadata).toMatchObject({
        generationBriefEvidence: evidence,
        generationSource: 'generation-brief-exemption:legacy_prompt_builder',
      });
    },
  );
});
