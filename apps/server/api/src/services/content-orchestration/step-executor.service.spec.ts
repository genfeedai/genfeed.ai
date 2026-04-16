import { ByokService } from '@api/services/byok/byok.service';
import type { StepExecutionContext } from '@api/services/content-orchestration/step-executor.service';
import { StepExecutorService } from '@api/services/content-orchestration/step-executor.service';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/elevenlabs.service';
import { FalService } from '@api/services/integrations/fal/fal.service';
import { FleetService } from '@api/services/integrations/fleet/fleet.service';
import { HiggsFieldService } from '@api/services/integrations/higgsfield/higgsfield.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import {
  ImageTaskModel,
  MusicTaskModel,
  VideoTaskModel,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';

describe('StepExecutorService', () => {
  let service: StepExecutorService;
  let mockByokService: Record<string, ReturnType<typeof vi.fn>>;
  let mockFalService: Record<string, ReturnType<typeof vi.fn>>;
  let mockHiggsFieldService: Record<string, ReturnType<typeof vi.fn>>;
  let mockElevenLabsService: Record<string, ReturnType<typeof vi.fn>>;
  let mockFleetService: Record<string, ReturnType<typeof vi.fn>>;
  let mockLoggerService: Record<string, ReturnType<typeof vi.fn>>;
  let mockReplicateService: Record<string, ReturnType<typeof vi.fn>>;

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
      waitForCompletion: vi.fn(),
    };
    mockElevenLabsService = {
      textToSpeech: vi.fn(),
    };
    mockFleetService = {
      generateVideo: vi.fn(),
      pollJob: vi.fn(),
    };
    mockReplicateService = {
      getPrediction: vi.fn(),
      runModel: vi.fn(),
    };
    mockLoggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    service = new StepExecutorService(
      mockLoggerService as unknown as LoggerService,
      mockByokService as unknown as ByokService,
      mockFalService as unknown as FalService,
      mockHiggsFieldService as unknown as HiggsFieldService,
      mockElevenLabsService as unknown as ElevenLabsService,
      mockFleetService as unknown as FleetService,
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
      mockHiggsFieldService.waitForCompletion.mockResolvedValue({
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
      expect(mockHiggsFieldService.waitForCompletion).toHaveBeenCalledWith(
        'req-1',
        { organizationId: 'org-123' },
      );
    });

    it('should use previousResult.url when no explicit imageUrl', async () => {
      mockHiggsFieldService.generateImageToVideo.mockResolvedValue({
        requestId: 'req-2',
      });
      mockHiggsFieldService.waitForCompletion.mockResolvedValue({
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
        audio_base64: 'dGVzdA==',
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
      expect(result.url).toContain('data:audio/mpeg;base64,');
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
    it('should route REPLICATE to ReplicateService and return the generated audio url', async () => {
      mockByokService.resolveApiKey.mockResolvedValue({
        apiKey: 'replicate-key',
      });
      mockReplicateService.runModel.mockResolvedValue('prediction-1');
      mockReplicateService.getPrediction.mockResolvedValue({
        output: ['https://replicate.delivery/music.mp3'],
        status: 'succeeded',
      });

      const result = await service.execute(
        {
          duration: 12,
          model: MusicTaskModel.REPLICATE,
          prompt: 'lo-fi synthwave',
          type: 'text-to-music',
        },
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
      expect(mockReplicateService.runModel).toHaveBeenCalledWith(
        'meta/musicgen:latest',
        {
          duration: 12,
          prompt: 'lo-fi synthwave',
        },
        'replicate-key',
      );
      expect(mockReplicateService.getPrediction).toHaveBeenCalledWith(
        'prediction-1',
        'replicate-key',
      );
    });

    it('should use the global prompt when a text-to-music step omits its own prompt', async () => {
      mockByokService.resolveApiKey.mockResolvedValue(null);
      mockReplicateService.runModel.mockResolvedValue('prediction-2');
      mockReplicateService.getPrediction.mockResolvedValue({
        output: { url: 'https://replicate.delivery/global.mp3' },
        status: 'succeeded',
      });

      const promise = service.execute(
        { model: MusicTaskModel.REPLICATE, type: 'text-to-music' },
        baseContext,
      );

      const result = await promise;

      expect(result.url).toBe('https://replicate.delivery/global.mp3');
      expect(mockReplicateService.runModel).toHaveBeenCalledWith(
        'meta/musicgen:latest',
        {
          duration: 10,
          prompt: 'a beautiful sunset',
        },
        undefined,
      );
    });

    it('should throw when a text-to-music step has no prompt available', async () => {
      await expect(
        service.execute(
          { model: MusicTaskModel.REPLICATE, type: 'text-to-music' },
          { organizationId: 'org-123' },
        ),
      ).rejects.toThrow('requires prompt');
    });

    it('should throw for unsupported music models', async () => {
      await expect(
        service.execute(
          { model: MusicTaskModel.ELEVENLABS, type: 'text-to-music' },
          baseContext,
        ),
      ).rejects.toThrow('not yet supported');
    });
  });

  describe('image-to-video - ComfyUI', () => {
    it('should route COMFYUI to FleetService and poll for completion', async () => {
      mockFleetService.generateVideo.mockResolvedValue({ jobId: 'job-123' });
      mockFleetService.pollJob
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
      expect(mockFleetService.generateVideo).toHaveBeenCalled();
      expect(mockFleetService.pollJob).toHaveBeenCalledWith(
        'videos',
        'job-123',
        'org-123',
      );

      setTimeoutSpy.mockRestore();
    });

    it('should throw when FleetService is not available', async () => {
      mockFleetService.generateVideo.mockResolvedValue(null);

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
      mockFleetService.generateVideo.mockResolvedValue({ jobId: 'job-fail' });
      mockFleetService.pollJob.mockResolvedValue({ status: 'failed' });
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
      mockFleetService.generateVideo.mockResolvedValue({
        jobId: 'job-timeout',
      });
      mockFleetService.pollJob.mockResolvedValue({ status: 'processing' });
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
    it('should use custom aspectRatio', async () => {
      mockHiggsFieldService.generateImageToVideo.mockResolvedValue({
        requestId: 'req-1',
      });
      mockHiggsFieldService.waitForCompletion.mockResolvedValue({
        videoUrl: 'https://hf.ai/video.mp4',
      });

      await service.execute(
        {
          aspectRatio: '16:9',
          imageUrl: 'https://example.com/img.png',
          model: VideoTaskModel.HIGGSFIELD,
          type: 'image-to-video',
        },
        baseContext,
      );

      expect(mockHiggsFieldService.generateImageToVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          aspectRatio: '16:9',
        }),
      );
    });

    it('should use custom duration', async () => {
      mockHiggsFieldService.generateImageToVideo.mockResolvedValue({
        requestId: 'req-1',
      });
      mockHiggsFieldService.waitForCompletion.mockResolvedValue({
        videoUrl: 'https://hf.ai/video.mp4',
      });

      await service.execute(
        {
          duration: 10,
          imageUrl: 'https://example.com/img.png',
          model: VideoTaskModel.HIGGSFIELD,
          type: 'image-to-video',
        },
        baseContext,
      );

      expect(mockHiggsFieldService.generateImageToVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          duration: 10,
        }),
      );
    });

    it('should default to 9:16 aspectRatio and 5 duration', async () => {
      mockHiggsFieldService.generateImageToVideo.mockResolvedValue({
        requestId: 'req-1',
      });
      mockHiggsFieldService.waitForCompletion.mockResolvedValue({
        videoUrl: 'https://hf.ai/video.mp4',
      });

      await service.execute(
        {
          imageUrl: 'https://example.com/img.png',
          model: VideoTaskModel.HIGGSFIELD,
          type: 'image-to-video',
        },
        baseContext,
      );

      expect(mockHiggsFieldService.generateImageToVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          aspectRatio: '9:16',
          duration: 5,
        }),
      );
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
        audio_base64: 'dGVzdA==',
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
        audio_base64: 'dGVzdA==',
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
