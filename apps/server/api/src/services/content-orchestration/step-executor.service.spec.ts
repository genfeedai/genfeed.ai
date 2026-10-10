import { MusicGenerationService } from '@api/collections/musics/services/music-generation.service';
import { MusicGenerationProviderRegistryService } from '@api/collections/musics/services/music-generation-provider-registry.service';
import { ByokService } from '@api/services/byok/byok.service';
import type { StepExecutionContext } from '@api/services/content-orchestration/step-executor.service';
import { StepExecutorService } from '@api/services/content-orchestration/step-executor.service';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/services/elevenlabs.service';
import { FalService } from '@api/services/integrations/fal/services/fal.service';
import { HiggsFieldService } from '@api/services/integrations/higgsfield/higgsfield.service';
import { ManagedInferenceRuntimeService } from '@api/services/integrations/managed-inference-runtime/managed-inference-runtime.service';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import {
  ImageTaskModel,
  ModelCategory,
  ModelProvider,
  MusicTaskModel,
  VideoTaskModel,
} from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';

describe('StepExecutorService', () => {
  let service: StepExecutorService;
  let mockByokService: Record<string, ReturnType<typeof vi.fn>>;
  let mockFalService: Record<string, ReturnType<typeof vi.fn>>;
  let mockHiggsFieldService: Record<string, ReturnType<typeof vi.fn>>;
  let mockElevenLabsService: Record<string, ReturnType<typeof vi.fn>>;
  let mockManagedInferenceRuntimeService: Record<
    string,
    ReturnType<typeof vi.fn>
  >;
  let mockLoggerService: Record<string, ReturnType<typeof vi.fn>>;
  let mockReplicateService: Record<string, ReturnType<typeof vi.fn>>;
  let mockMusicGenerationService: Record<string, ReturnType<typeof vi.fn>>;
  let mockMusicProviderRegistry: Record<string, ReturnType<typeof vi.fn>>;

  const baseContext: StepExecutionContext = {
    globalPrompt: 'a beautiful sunset',
    organizationId: 'org-123',
  };

  beforeEach(async () => {
    mockByokService = {
      resolveApiKey: vi.fn(),
    };
    mockFalService = {
      generateImage: vi.fn(),
      generateVideo: vi.fn(),
    };
    mockHiggsFieldService = {
      generateImageToVideo: vi.fn(),
      waitForVideoCompletion: vi.fn(),
    };
    mockElevenLabsService = {
      textToSpeech: vi.fn(),
    };
    mockManagedInferenceRuntimeService = {
      generateVideo: vi.fn(),
      pollJob: vi.fn(),
    };
    mockReplicateService = {
      getPrediction: vi.fn(),
      runModel: vi.fn(),
    };
    mockMusicGenerationService = {
      resolveMusicModel: vi.fn(),
    };
    mockMusicProviderRegistry = {
      generate: vi.fn(),
      providerFor: vi.fn(),
    };
    mockLoggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    service = new StepExecutorService(
      mockLoggerService as unknown as LoggerService,
      mockByokService as unknown as ByokService,
      mockFalService as unknown as FalService,
      mockHiggsFieldService as unknown as HiggsFieldService,
      mockElevenLabsService as unknown as ElevenLabsService,
      mockManagedInferenceRuntimeService as unknown as ManagedInferenceRuntimeService,
      mockMusicGenerationService as unknown as MusicGenerationService,
      mockMusicProviderRegistry as unknown as MusicGenerationProviderRegistryService,
      mockReplicateService as unknown as ReplicateService,
    );
  });

  describe('text-to-image', () => {
    it('should route FAL model to FalService.generateImage', async () => {
      mockFalService.generateImage.mockResolvedValue({
        height: 1024,
        url: 'https://fal.ai/image.png',
        width: 1024,
      });

      const result = await service.execute(
        { model: ImageTaskModel.FAL, type: 'text-to-image' },
        baseContext,
      );

      expect(result).toEqual({
        contentType: 'image/png',
        url: 'https://fal.ai/image.png',
      });
      expect(mockFalService.generateImage).toHaveBeenCalledWith(
        'fal-ai/flux/dev',
        { image_size: '1024x1024', prompt: 'a beautiful sunset' },
      );
    });

    it('should use step prompt over global prompt', async () => {
      mockFalService.generateImage.mockResolvedValue({
        url: 'https://fal.ai/img.png',
      });

      await service.execute(
        {
          model: ImageTaskModel.FAL,
          prompt: 'step prompt',
          type: 'text-to-image',
        },
        baseContext,
      );

      expect(mockFalService.generateImage).toHaveBeenCalledWith(
        'fal-ai/flux/dev',
        expect.objectContaining({ prompt: 'step prompt' }),
      );
    });

    it('should throw for unsupported image model', async () => {
      await expect(
        service.execute(
          { model: ImageTaskModel.COMFYUI, type: 'text-to-image' },
          baseContext,
        ),
      ).rejects.toThrow('not yet supported');
    });
  });

  describe('image-to-video', () => {
    it('should route HIGGSFIELD to HiggsFieldService', async () => {
      mockHiggsFieldService.generateImageToVideo.mockResolvedValue({
        requestId: 'req-1',
      });
      mockHiggsFieldService.waitForVideoCompletion.mockResolvedValue({
        videoUrl: 'https://hf.ai/video.mp4',
      });

      const result = await service.execute(
        {
          imageUrl: 'https://example.com/img.png',
          model: VideoTaskModel.HIGGSFIELD,
          type: 'image-to-video',
        },
        baseContext,
      );

      expect(result).toEqual({
        contentType: 'video/mp4',
        url: 'https://hf.ai/video.mp4',
      });
      expect(mockHiggsFieldService.generateImageToVideo).toHaveBeenCalled();
      expect(mockHiggsFieldService.waitForVideoCompletion).toHaveBeenCalledWith(
        'req-1',
        { organizationId: 'org-123' },
      );
    });

    it('should use previousResult.url when no explicit imageUrl', async () => {
      mockHiggsFieldService.generateImageToVideo.mockResolvedValue({
        requestId: 'req-2',
      });
      mockHiggsFieldService.waitForVideoCompletion.mockResolvedValue({
        videoUrl: 'https://hf.ai/v2.mp4',
      });

      await service.execute(
        { model: VideoTaskModel.HIGGSFIELD, type: 'image-to-video' },
        {
          ...baseContext,
          previousResult: {
            contentType: 'image/png',
            url: 'https://prev.com/image.png',
          },
        },
      );

      expect(mockHiggsFieldService.generateImageToVideo).toHaveBeenCalledWith(
        expect.objectContaining({ imageUrl: 'https://prev.com/image.png' }),
      );
    });

    it('should throw if no imageUrl and no previous result', async () => {
      await expect(
        service.execute(
          { model: VideoTaskModel.HIGGSFIELD, type: 'image-to-video' },
          baseContext,
        ),
      ).rejects.toThrow('requires an imageUrl');
    });

    it('should route FAL video model', async () => {
      mockFalService.generateVideo.mockResolvedValue({
        url: 'https://fal.ai/video.mp4',
      });

      const result = await service.execute(
        {
          imageUrl: 'https://example.com/img.png',
          model: VideoTaskModel.FAL,
          type: 'image-to-video',
        },
        baseContext,
      );

      expect(result).toEqual({
        contentType: 'video/mp4',
        url: 'https://fal.ai/video.mp4',
      });
    });
  });

  describe('text-to-speech', () => {
    it('should route ELEVENLABS to ElevenLabsService', async () => {
      mockElevenLabsService.textToSpeech.mockResolvedValue({
        audioBase64: 'dGVzdA==',
      });

      const result = await service.execute(
        {
          model: MusicTaskModel.ELEVENLABS,
          text: 'Hello world',
          type: 'text-to-speech',
          voiceId: 'voice-1',
        },
        baseContext,
      );

      expect(result.contentType).toBe('audio/mpeg');
      expect(result.url).toBe('data:audio/mpeg;base64,dGVzdA==');
      expect(mockElevenLabsService.textToSpeech).toHaveBeenCalledWith(
        'voice-1',
        'Hello world',
        'org-123',
      );
    });

    it('should throw if no text provided', async () => {
      await expect(
        service.execute(
          {
            model: MusicTaskModel.ELEVENLABS,
            type: 'text-to-speech',
            voiceId: 'v1',
          },
          { organizationId: 'org-1' },
        ),
      ).rejects.toThrow('requires text');
    });
  });

  describe('text-to-music', () => {
    const lyriaModel = {
      category: ModelCategory.MUSIC,
      endpoint: 'fal-ai/lyria3/pro',
      isActive: true,
      key: MODEL_KEYS.FAL_LYRIA3_PRO,
      provider: ModelProvider.FAL,
    };
    const replicateMusicModel = {
      category: ModelCategory.MUSIC,
      endpoint: 'acme/replicate-music:abc123',
      isActive: true,
      key: 'acme/replicate-music',
      provider: ModelProvider.REPLICATE,
    };

    const resolveTo = (modelDocument: Record<string, unknown>) => {
      mockMusicGenerationService.resolveMusicModel.mockResolvedValue({
        model: modelDocument.key,
        modelDocument,
      });
      mockMusicProviderRegistry.providerFor.mockReturnValue(
        modelDocument.provider === ModelProvider.FAL ? 'fal' : 'replicate',
      );
    };

    it('resolves the saved or registry default when the step names no model', async () => {
      resolveTo(lyriaModel);
      mockByokService.resolveApiKey.mockResolvedValue(null);
      mockMusicProviderRegistry.generate.mockResolvedValue({
        externalId: 'fal-run-1',
        outputUrl: 'https://fal.media/lyria.mp3',
      });

      const result = await service.execute(
        { duration: 12, prompt: 'lo-fi synthwave', type: 'text-to-music' },
        { ...baseContext, brandId: 'brand-1' },
      );

      expect(result).toEqual({
        contentType: 'audio/mpeg',
        url: 'https://fal.media/lyria.mp3',
      });
      expect(mockMusicGenerationService.resolveMusicModel).toHaveBeenCalledWith(
        {
          brandId: 'brand-1',
          explicitModel: undefined,
          organizationId: 'org-123',
        },
      );
      expect(mockByokService.resolveApiKey).toHaveBeenCalledWith(
        'org-123',
        'fal',
      );
      expect(mockMusicProviderRegistry.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKeyOverride: undefined,
          duration: 12,
          model: MODEL_KEYS.FAL_LYRIA3_PRO,
          modelCategory: ModelCategory.MUSIC,
          modelEndpoint: 'fal-ai/lyria3/pro',
          modelProvider: ModelProvider.FAL,
          outputs: 1,
          prompt: 'lo-fi synthwave',
        }),
      );
      expect(mockReplicateService.runModel).not.toHaveBeenCalled();
      expect(
        JSON.stringify(mockMusicProviderRegistry.generate.mock.calls),
      ).not.toContain('musicgen');
    });

    it('keeps an explicit step model strict and dispatches nothing when it is rejected', async () => {
      mockMusicGenerationService.resolveMusicModel.mockRejectedValue(
        new BadRequestException({
          detail: `No active music model is available for "${MODEL_KEYS.REPLICATE_META_MUSICGEN}"`,
          title: 'Music model unavailable',
        }),
      );

      await expect(
        service.execute(
          {
            model: MODEL_KEYS.REPLICATE_META_MUSICGEN,
            prompt: 'lo-fi synthwave',
            type: 'text-to-music',
          },
          { ...baseContext, brandId: 'brand-1' },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockMusicGenerationService.resolveMusicModel).toHaveBeenCalledWith(
        {
          brandId: 'brand-1',
          explicitModel: MODEL_KEYS.REPLICATE_META_MUSICGEN,
          organizationId: 'org-123',
        },
      );
      expect(mockMusicProviderRegistry.generate).not.toHaveBeenCalled();
      expect(mockReplicateService.runModel).not.toHaveBeenCalled();
    });

    it('polls a Replicate-hosted resolved model with the organization key', async () => {
      resolveTo(replicateMusicModel);
      mockByokService.resolveApiKey.mockResolvedValue({
        apiKey: 'replicate-key',
      });
      mockMusicProviderRegistry.generate.mockResolvedValue({
        externalId: 'prediction-1',
      });
      mockReplicateService.getPrediction.mockResolvedValue({
        output: ['https://replicate.delivery/music.mp3'],
        status: 'succeeded',
      });

      const result = await service.execute(
        { model: 'acme/replicate-music', type: 'text-to-music' },
        baseContext,
      );

      expect(result).toEqual({
        contentType: 'audio/mpeg',
        url: 'https://replicate.delivery/music.mp3',
      });
      expect(mockByokService.resolveApiKey).toHaveBeenCalledWith(
        'org-123',
        'replicate',
      );
      expect(mockMusicProviderRegistry.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKeyOverride: 'replicate-key',
          duration: 10,
          model: 'acme/replicate-music',
          modelEndpoint: 'acme/replicate-music:abc123',
          prompt: 'a beautiful sunset',
        }),
      );
      expect(mockReplicateService.getPrediction).toHaveBeenCalledWith(
        'prediction-1',
        'replicate-key',
      );
    });

    it('fails when a synchronous provider returns no output URL', async () => {
      resolveTo(lyriaModel);
      mockByokService.resolveApiKey.mockResolvedValue(null);
      mockMusicProviderRegistry.generate.mockResolvedValue({
        externalId: 'fal-run-2',
      });

      await expect(
        service.execute({ type: 'text-to-music' }, baseContext),
      ).rejects.toThrow('returned no output URL');
      expect(mockReplicateService.getPrediction).not.toHaveBeenCalled();
    });

    it('should throw when a text-to-music step has no prompt available', async () => {
      await expect(
        service.execute(
          { type: 'text-to-music' },
          { organizationId: 'org-123' },
        ),
      ).rejects.toThrow('requires prompt');
      expect(
        mockMusicGenerationService.resolveMusicModel,
      ).not.toHaveBeenCalled();
    });
  });

  describe('image-to-video - ComfyUI', () => {
    it('should route COMFYUI to ManagedInferenceRuntimeService and poll for completion', async () => {
      mockManagedInferenceRuntimeService.generateVideo.mockResolvedValue({
        jobId: 'job-123',
      });
      mockManagedInferenceRuntimeService.pollJob
        .mockResolvedValueOnce({ status: 'processing' })
        .mockResolvedValueOnce({
          output: { video_url: 'https://comfy.ai/video.mp4' },
          status: 'completed',
        });
      const setTimeoutSpy = vi
        .spyOn(globalThis, 'setTimeout')
        .mockImplementation(((callback: TimerHandler) => {
          if (typeof callback === 'function') {
            callback();
          }
          return 0 as unknown as ReturnType<typeof setTimeout>;
        }) as typeof setTimeout);

      const result = await service.execute(
        {
          imageUrl: 'https://example.com/img.png',
          model: VideoTaskModel.COMFYUI,
          type: 'image-to-video',
        },
        baseContext,
      );

      expect(result).toEqual({
        contentType: 'video/mp4',
        url: 'https://comfy.ai/video.mp4',
      });
      expect(
        mockManagedInferenceRuntimeService.generateVideo,
      ).toHaveBeenCalled();
      expect(mockManagedInferenceRuntimeService.pollJob).toHaveBeenCalledWith(
        'videos',
        'job-123',
        'org-123',
      );

      setTimeoutSpy.mockRestore();
    });

    it('should throw when ManagedInferenceRuntimeService is not available', async () => {
      mockManagedInferenceRuntimeService.generateVideo.mockResolvedValue(null);

      await expect(
        service.execute(
          {
            imageUrl: 'https://example.com/img.png',
            model: VideoTaskModel.COMFYUI,
            type: 'image-to-video',
          },
          baseContext,
        ),
      ).rejects.toThrow('Fleet videos instance not available');
    });

    it('should throw when ComfyUI job fails', async () => {
      mockManagedInferenceRuntimeService.generateVideo.mockResolvedValue({
        jobId: 'job-fail',
      });
      mockManagedInferenceRuntimeService.pollJob.mockResolvedValue({
        status: 'failed',
      });
      const setTimeoutSpy = vi
        .spyOn(globalThis, 'setTimeout')
        .mockImplementation(((callback: TimerHandler) => {
          if (typeof callback === 'function') {
            callback();
          }
          return 0 as unknown as ReturnType<typeof setTimeout>;
        }) as typeof setTimeout);

      const error = await service
        .execute(
          {
            imageUrl: 'https://example.com/img.png',
            model: VideoTaskModel.COMFYUI,
            type: 'image-to-video',
          },
          baseContext,
        )
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('ComfyUI job job-fail failed');

      setTimeoutSpy.mockRestore();
    });

    it('should timeout after 10 minutes', async () => {
      mockManagedInferenceRuntimeService.generateVideo.mockResolvedValue({
        jobId: 'job-timeout',
      });
      mockManagedInferenceRuntimeService.pollJob.mockResolvedValue({
        status: 'processing',
      });
      const dateNowSpy = vi
        .spyOn(Date, 'now')
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(610001);
      const setTimeoutSpy = vi
        .spyOn(globalThis, 'setTimeout')
        .mockImplementation(((callback: TimerHandler) => {
          if (typeof callback === 'function') {
            callback();
          }
          return 0 as unknown as ReturnType<typeof setTimeout>;
        }) as typeof setTimeout);

      const error = await service
        .execute(
          {
            imageUrl: 'https://example.com/img.png',
            model: VideoTaskModel.COMFYUI,
            type: 'image-to-video',
          },
          baseContext,
        )
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(
        'ComfyUI job job-timeout timed out',
      );

      dateNowSpy.mockRestore();
      setTimeoutSpy.mockRestore();
    });
  });

  describe('image-to-video - configuration options', () => {
    it('sends the DoP model key and ignores step sizing the endpoint cannot take', async () => {
      mockHiggsFieldService.generateImageToVideo.mockResolvedValue({
        requestId: 'req-1',
      });
      mockHiggsFieldService.waitForVideoCompletion.mockResolvedValue({
        videoUrl: 'https://hf.ai/video.mp4',
      });

      await service.execute(
        {
          aspectRatio: '16:9',
          duration: 10,
          imageUrl: 'https://example.com/img.png',
          model: VideoTaskModel.HIGGSFIELD,
          type: 'image-to-video',
        },
        baseContext,
      );

      // DoP sizes the clip from the source image, so neither value is sent.
      expect(mockHiggsFieldService.generateImageToVideo).toHaveBeenCalledWith({
        imageUrl: 'https://example.com/img.png',
        modelKey: MODEL_KEYS.HIGGSFIELD_DOP_TURBO,
        organizationId: 'org-123',
        prompt: 'a beautiful sunset',
      });
    });
  });

  describe('text-to-image - configuration options', () => {
    it('should use custom aspectRatio', async () => {
      mockFalService.generateImage.mockResolvedValue({
        url: 'https://fal.ai/image.png',
      });

      await service.execute(
        {
          aspectRatio: '512x768',
          model: ImageTaskModel.FAL,
          type: 'text-to-image',
        },
        baseContext,
      );

      expect(mockFalService.generateImage).toHaveBeenCalledWith(
        'fal-ai/flux/dev',
        expect.objectContaining({
          image_size: '512x768',
        }),
      );
    });

    it('should default to 1024x1024 when aspectRatio not specified', async () => {
      mockFalService.generateImage.mockResolvedValue({
        url: 'https://fal.ai/image.png',
      });

      await service.execute(
        {
          model: ImageTaskModel.FAL,
          type: 'text-to-image',
        },
        baseContext,
      );

      expect(mockFalService.generateImage).toHaveBeenCalledWith(
        'fal-ai/flux/dev',
        expect.objectContaining({
          image_size: '1024x1024',
        }),
      );
    });
  });

  describe('text-to-speech - configuration options', () => {
    it('should use step text over global prompt', async () => {
      mockElevenLabsService.textToSpeech.mockResolvedValue({
        audioBase64: 'dGVzdA==',
      });

      await service.execute(
        {
          model: MusicTaskModel.ELEVENLABS,
          text: 'Step text',
          type: 'text-to-speech',
          voiceId: 'voice-1',
        },
        { ...baseContext, globalPrompt: 'Global prompt' },
      );

      expect(mockElevenLabsService.textToSpeech).toHaveBeenCalledWith(
        'voice-1',
        'Step text',
        'org-123',
      );
    });

    it('should use global prompt when step text is missing', async () => {
      mockElevenLabsService.textToSpeech.mockResolvedValue({
        audioBase64: 'dGVzdA==',
      });

      await service.execute(
        {
          model: MusicTaskModel.ELEVENLABS,
          type: 'text-to-speech',
          voiceId: 'voice-1',
        },
        { ...baseContext, globalPrompt: 'Global prompt' },
      );

      expect(mockElevenLabsService.textToSpeech).toHaveBeenCalledWith(
        'voice-1',
        'Global prompt',
        'org-123',
      );
    });
  });

  describe('text-to-speech - unsupported models', () => {
    it('should throw for unsupported TTS models', async () => {
      await expect(
        service.execute(
          {
            model: MusicTaskModel.REPLICATE,
            text: 'Hello',
            type: 'text-to-speech',
            voiceId: 'v1',
          },
          baseContext,
        ),
      ).rejects.toThrow('not yet supported');
    });
  });

  describe('image-to-video - FAL with step prompt', () => {
    it('should pass step prompt to FAL service', async () => {
      mockFalService.generateVideo.mockResolvedValue({
        url: 'https://fal.ai/video.mp4',
      });

      await service.execute(
        {
          imageUrl: 'https://example.com/img.png',
          model: VideoTaskModel.FAL,
          prompt: 'Animate this image',
          type: 'image-to-video',
        },
        baseContext,
      );

      expect(mockFalService.generateVideo).toHaveBeenCalledWith(
        'fal-ai/minimax/video-01-live',
        expect.objectContaining({
          prompt: 'Animate this image',
        }),
      );
    });
  });
});
