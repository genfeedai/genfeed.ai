import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import {
  type SoundOverlayInput,
  SoundOverlayProcessor,
} from '@api/services/workflow-executor/processors/sound-overlay.processor';
import { MixMode } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('SoundOverlayProcessor', () => {
  let processor: SoundOverlayProcessor;
  let filesClient: vi.Mocked<FilesClientService>;
  let logger: vi.Mocked<LoggerService>;

  const validInput: SoundOverlayInput = {
    audioVolume: 0.8,
    fadeIn: 0,
    fadeOut: 0,
    mixMode: MixMode.MIX,
    soundUrl: 'https://cdn.example.com/sound.mp3',
    videoUrl: 'https://cdn.example.com/video.mp4',
    videoVolume: 1.0,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SoundOverlayProcessor,
        {
          provide: FilesClientService,
          useValue: {
            audioOverlay: vi.fn(),
            getPresignedUploadUrl: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
      ],
    }).compile();

    processor = module.get<SoundOverlayProcessor>(SoundOverlayProcessor);
    filesClient = module.get(FilesClientService);
    logger = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('process', () => {
    it('should process sound overlay and return output URL', async () => {
      filesClient.getPresignedUploadUrl.mockResolvedValue({
        publicUrl: 'https://cdn.example.com/output.mp4',
        s3Key: 'workflow/sound-overlay/output.mp4',
      });
      filesClient.audioOverlay.mockResolvedValue({
        duration: 42,
        publicUrl: 'https://cdn.example.com/output.mp4',
      });

      const result = await processor.process(validInput);

      expect(result.outputVideoUrl).toBe('https://cdn.example.com/output.mp4');
      expect(result.duration).toBe(42);
    });

    it('should call getPresignedUploadUrl with video type', async () => {
      filesClient.getPresignedUploadUrl.mockResolvedValue({
        publicUrl: 'https://cdn.example.com/out.mp4',
        s3Key: 'workflow/out.mp4',
      });
      filesClient.audioOverlay.mockResolvedValue({
        duration: 10,
        publicUrl: 'https://cdn.example.com/out.mp4',
      });

      await processor.process(validInput);

      expect(filesClient.getPresignedUploadUrl).toHaveBeenCalledWith(
        expect.stringContaining('workflow/sound-overlay/'),
        'video',
        'video/mp4',
      );
    });

    it('should pass all audio parameters to audioOverlay', async () => {
      filesClient.getPresignedUploadUrl.mockResolvedValue({
        publicUrl: 'https://out.example.com/result.mp4',
        s3Key: 'wf/overlay.mp4',
      });
      filesClient.audioOverlay.mockResolvedValue({
        duration: 5,
        publicUrl: 'https://out.example.com/result.mp4',
      });

      const input: SoundOverlayInput = {
        audioVolume: 0.5,
        fadeIn: 2,
        fadeOut: 1,
        mixMode: MixMode.REPLACE,
        soundUrl: 'https://sound.example.com/audio.mp3',
        videoUrl: 'https://video.example.com/clip.mp4',
        videoVolume: 0.8,
      };

      await processor.process(input);

      expect(filesClient.audioOverlay).toHaveBeenCalledWith(
        expect.objectContaining({
          audioUrl: input.soundUrl,
          audioVolume: 0.5,
          fadeIn: 2,
          fadeOut: 1,
          mixMode: MixMode.REPLACE,
          videoUrl: input.videoUrl,
          videoVolume: 0.8,
        }),
      );
    });

    it('should default duration to 0 when audioOverlay returns no duration', async () => {
      filesClient.getPresignedUploadUrl.mockResolvedValue({
        publicUrl: 'https://out.example.com/x.mp4',
        s3Key: 'x.mp4',
      });
      filesClient.audioOverlay.mockResolvedValue({
        publicUrl: 'https://out.example.com/x.mp4',
      });

      const result = await processor.process(validInput);

      expect(result.duration).toBe(0);
    });

    it('should throw Error when videoUrl is missing', async () => {
      const input: SoundOverlayInput = {
        ...validInput,
        videoUrl: '',
      };

      await expect(processor.process(input)).rejects.toThrow(
        'Video URL is required',
      );
    });

    it('should throw Error when soundUrl is missing', async () => {
      const input: SoundOverlayInput = {
        ...validInput,
        soundUrl: '',
      };

      await expect(processor.process(input)).rejects.toThrow(
        'Sound URL is required',
      );
    });

    it('should wrap and rethrow audioOverlay errors', async () => {
      filesClient.getPresignedUploadUrl.mockResolvedValue({
        publicUrl: 'https://cdn.example.com/out.mp4',
        s3Key: 'out.mp4',
      });
      filesClient.audioOverlay.mockRejectedValue(new Error('FFmpeg failed'));

      await expect(processor.process(validInput)).rejects.toThrow(
        'Audio overlay failed: FFmpeg failed',
      );
      expect(logger.error).toHaveBeenCalled();
    });

    it('should log processing start with truncated URLs', async () => {
      filesClient.getPresignedUploadUrl.mockResolvedValue({
        publicUrl: 'https://out.example.com/out.mp4',
        s3Key: 'out.mp4',
      });
      filesClient.audioOverlay.mockResolvedValue({
        duration: 30,
        publicUrl: 'https://out.example.com/out.mp4',
      });

      await processor.process(validInput);

      expect(logger.log).toHaveBeenCalledWith(
        'Processing SoundOverlay',
        expect.objectContaining({
          mixMode: MixMode.MIX,
        }),
      );
    });
  });
});
