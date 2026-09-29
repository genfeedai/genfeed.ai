import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { HookRemixService } from '@files/services/hook-remix/hook-remix.service';
import { UploadService } from '@files/services/upload/upload.service';
import { YtDlpService } from '@files/services/ytdlp/ytdlp.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

vi.mock('@libs/security/destination-guard', () => ({
  safeFetch: (input: string | URL, init?: RequestInit) =>
    globalThis.fetch(input, init),
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

global.fetch = vi.fn();

describe('HookRemixService', () => {
  let service: HookRemixService;
  let ytDlpService: { downloadVideo: ReturnType<typeof vi.fn> };

  const baseJobData = {
    ctaVideoUrl: 'https://cdn.example.com/cta.mp4',
    hookDurationSeconds: 10,
    jobId: 'job-abc123',
    organizationId: 'org-1',
    youtubeUrl: 'https://youtube.com/watch?v=test',
  };

  const mockUploadResult = {
    duration: 15,
    height: 1080,
    publicUrl: 'https://s3.example.com/org-1/hook-remix/job-abc123.mp4',
    size: 1024000,
    width: 1920,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HookRemixService,
        {
          provide: YtDlpService,
          useValue: {
            downloadVideo: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: FFmpegService,
          useValue: {
            concatenateVideos: vi.fn().mockResolvedValue(undefined),
            trimVideo: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: UploadService,
          useValue: {
            uploadToS3: vi.fn().mockResolvedValue(mockUploadResult),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(HookRemixService);
    ytDlpService = module.get(YtDlpService);
    module.get(FFmpegService);
    module.get(UploadService);
    module.get(LoggerService);

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      ok: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('processHookRemix', () => {
    it('rejects a traversal job ID before touching the filesystem', async () => {
      await expect(
        service.processHookRemix({ ...baseJobData, jobId: '../escape' }),
      ).rejects.toThrow(BadRequestException);

      expect(ytDlpService.downloadVideo).not.toHaveBeenCalled();
    });

    it('returns success result with S3 URL', async () => {
      const result = await service.processHookRemix(baseJobData);
      expect(result.success).toBe(true);
      expect(result.s3Url).toBe(mockUploadResult.publicUrl);
    });

    it('returns failure result when download fails', async () => {
      ytDlpService.downloadVideo.mockRejectedValue(
        new Error('Video unavailable'),
      );
      const result = await service.processHookRemix(baseJobData);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Video unavailable');
    });

    it('returns failure result when CTA download returns non-ok response', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });
      const result = await service.processHookRemix(baseJobData);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to download CTA clip');
    });
  });
});
