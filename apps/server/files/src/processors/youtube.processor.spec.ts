import type { ConfigService } from '@files/config/config.service';
import type { S3Service } from '@files/services/s3/s3.service';
import type { YoutubeService } from '@files/services/youtube/youtube.service';
import type { YtDlpService } from '@files/services/ytdlp/ytdlp.service';
import type { RedisService } from '@libs/redis/redis.service';
import type { HttpService } from '@nestjs/axios';
import type { Job } from 'bullmq';
import { of, throwError } from 'rxjs';
import type { Mock } from 'vitest';
import { YoutubeProcessor } from './youtube.processor';

const fsMock = vi.hoisted(() => ({
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  readFileSync: vi.fn().mockReturnValue(Buffer.from('audio-data')),
  rmdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}));
vi.mock('node:fs', () => fsMock);
vi.mock('fs', () => fsMock);

vi.mock('form-data', () => ({
  default: vi.fn().mockImplementation(function FormDataMock(this: {
    append: Mock;
    getHeaders: Mock;
  }) {
    this.append = vi.fn();
    this.getHeaders = vi.fn().mockReturnValue({ 'content-type': 'multipart' });
  }),
}));

import * as fs from 'node:fs';

type ProcessorInternals = {
  apiBaseUrl: string;
  process(job: Job): Promise<unknown>;
  updateTranscriptStatus(
    transcriptId: string,
    status: string,
    additionalData?: unknown,
  ): Promise<void>;
};

function createJob(name: string, data: Record<string, unknown>): Job {
  return {
    data,
    id: 'job-1',
    name,
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job;
}

describe('YoutubeProcessor', () => {
  const configService = { get: vi.fn() };
  const httpService = {
    get: vi.fn().mockReturnValue(of({ data: {} })),
    patch: vi.fn().mockReturnValue(of({ data: {} })),
    post: vi.fn().mockReturnValue(of({ data: { text: 'transcribed text' } })),
  };
  const redisService = { publish: vi.fn().mockResolvedValue(undefined) };
  const s3Service = {
    downloadFromUrl: vi.fn().mockResolvedValue(undefined),
    uploadFile: vi
      .fn()
      .mockResolvedValue({ Location: 'https://cdn.example.com/audio.mp3' }),
  };
  const ytdlpService = {
    downloadAudioLowestQuality: vi
      .fn()
      .mockResolvedValue('/tmp/youtube/t-1/123.mp3'),
  };
  const youtubeService = {
    uploadVideo: vi.fn().mockResolvedValue('yt-video-id'),
  };

  function buildProcessor(): ProcessorInternals {
    return new YoutubeProcessor(
      configService as unknown as ConfigService,
      httpService as unknown as HttpService,
      redisService as unknown as RedisService,
      s3Service as unknown as S3Service,
      ytdlpService as unknown as YtDlpService,
      youtubeService as unknown as YoutubeService,
    ) as unknown as ProcessorInternals;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    configService.get.mockReturnValue('https://api.genfeed.ai');
    httpService.get.mockReturnValue(of({ data: {} }));
    httpService.patch.mockReturnValue(of({ data: {} }));
    httpService.post.mockReturnValue(
      of({ data: { text: 'transcribed text' } }),
    );
    redisService.publish.mockResolvedValue(undefined);
    s3Service.downloadFromUrl.mockResolvedValue(undefined);
    s3Service.uploadFile.mockResolvedValue({
      Location: 'https://cdn.example.com/audio.mp3',
    });
    ytdlpService.downloadAudioLowestQuality.mockResolvedValue(
      '/tmp/youtube/t-1/123.mp3',
    );
    youtubeService.uploadVideo.mockResolvedValue('yt-video-id');
    (fs.existsSync as Mock).mockReturnValue(false);
    (fs.readdirSync as Mock).mockReturnValue([]);
  });

  describe('apiBaseUrl', () => {
    it('uses GENFEEDAI_API_URL and appends the /v1 route prefix', () => {
      configService.get.mockReturnValue('https://api.genfeed.ai');

      expect(buildProcessor().apiBaseUrl).toBe('https://api.genfeed.ai/v1');
    });

    it('does not double the prefix when the configured URL already has /v1', () => {
      configService.get.mockReturnValue('https://api.genfeed.ai/v1');

      expect(buildProcessor().apiBaseUrl).toBe('https://api.genfeed.ai/v1');
    });

    it('strips trailing slashes before appending', () => {
      configService.get.mockReturnValue('https://api.genfeed.ai/');

      expect(buildProcessor().apiBaseUrl).toBe('https://api.genfeed.ai/v1');
    });

    it('falls back to localhost for local development', () => {
      configService.get.mockReturnValue(undefined);

      expect(buildProcessor().apiBaseUrl).toBe('http://localhost:3010/v1');
    });
  });

  describe('updateTranscriptStatus', () => {
    it('PATCHes the configured API host instead of a hardcoded localhost', async () => {
      configService.get.mockReturnValue('https://api.genfeed.ai');
      const processor = buildProcessor();

      await processor.updateTranscriptStatus('t_1', 'completed');

      expect(httpService.patch).toHaveBeenCalledWith(
        'https://api.genfeed.ai/v1/transcripts/t_1',
        expect.objectContaining({ status: 'completed' }),
      );
    });
  });

  describe('process', () => {
    it('throws for unknown job names', async () => {
      const processor = buildProcessor();
      const job = createJob('unknown-job', {});

      await expect(processor.process(job)).rejects.toThrow(
        'Unknown YouTube job type: unknown-job',
      );
    });

    it('routes youtube-download-audio jobs to handleYoutubeDownload', async () => {
      const processor = buildProcessor();
      const job = createJob('youtube-download-audio', {
        organizationId: 'org-1',
        transcriptId: 't-1',
        userId: 'user-1',
        youtubeId: 'yt-1',
        youtubeUrl: 'https://youtube.com/watch?v=yt-1',
      });

      const result = (await processor.process(job)) as { success: boolean };

      expect(result.success).toBe(true);
      expect(ytdlpService.downloadAudioLowestQuality).toHaveBeenCalled();
      expect(s3Service.uploadFile).toHaveBeenCalled();
      expect(redisService.publish).toHaveBeenCalledWith(
        'queue:whisper-transcribe',
        expect.objectContaining({ transcriptId: 't-1' }),
      );
    });

    it('routes whisper-transcribe jobs to handleWhisperTranscription', async () => {
      const processor = buildProcessor();
      const job = createJob('whisper-transcribe', {
        audioUrl: 'https://cdn.example.com/audio.mp3',
        organizationId: 'org-1',
        transcriptId: 't-1',
        userId: 'user-1',
      });

      const result = (await processor.process(job)) as {
        success: boolean;
        transcriptText: string;
      };

      expect(result.success).toBe(true);
      expect(result.transcriptText).toBe('transcribed text');
      expect(s3Service.downloadFromUrl).toHaveBeenCalled();
      expect(redisService.publish).toHaveBeenCalledWith(
        'queue:generate-article-from-transcript',
        expect.objectContaining({ transcriptId: 't-1' }),
      );
    });

    it('routes upload-youtube-unlisted jobs to handleUpload', async () => {
      const processor = buildProcessor();
      const job = createJob('upload-youtube-unlisted', {
        credential: { accessToken: 'token' },
        description: 'desc',
        ingredientId: 'ing-1',
        organizationId: 'org-1',
        postId: 'post-1',
        status: 'unlisted',
        tags: ['a'],
        title: 'title',
        userId: 'user-1',
      });

      const result = (await processor.process(job)) as {
        success: boolean;
        metadata: { videoUrl: string };
      };

      expect(result.success).toBe(true);
      expect(result.metadata.videoUrl).toContain('yt-video-id');
      expect(redisService.publish).toHaveBeenCalledWith(
        'youtube:upload:complete',
        expect.objectContaining({ postId: 'post-1', status: 'unlisted' }),
      );
    });

    it('routes upload-youtube jobs to handleUpload as well', async () => {
      const processor = buildProcessor();
      const job = createJob('upload-youtube', {
        credential: { accessToken: 'token' },
        organizationId: 'org-1',
        postId: 'post-2',
        status: 'public',
        userId: 'user-1',
      });

      const result = (await processor.process(job)) as { success: boolean };

      expect(result.success).toBe(true);
      expect(redisService.publish).toHaveBeenCalledWith(
        'youtube:upload:complete',
        expect.objectContaining({ postId: 'post-2', status: 'public' }),
      );
    });
  });

  describe('handleYoutubeDownload', () => {
    it('applies fetched metadata to the transcript update payload', async () => {
      httpService.get.mockReturnValue(
        of({
          data: {
            data: {
              description: 'a video',
              duration: 120,
              id: 'yt-1',
              likeCount: 5,
              publishedAt: '2024-01-01T00:00:00.000Z',
              title: 'My Video',
              viewCount: 10,
            },
          },
        }),
      );
      const processor = buildProcessor();
      const job = createJob('youtube-download-audio', {
        organizationId: 'org-1',
        transcriptId: 't-1',
        userId: 'user-1',
        youtubeId: 'yt-1',
        youtubeUrl: 'https://youtube.com/watch?v=yt-1',
      });

      await processor.process(job);

      expect(httpService.patch).toHaveBeenCalledWith(
        expect.stringContaining('/transcripts/t-1'),
        expect.objectContaining({
          videoDuration: 120,
          videoTitle: 'My Video',
        }),
      );
    });

    it('cleans up the downloaded file and empty directory', async () => {
      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.readdirSync as Mock).mockReturnValue([]);
      const processor = buildProcessor();
      const job = createJob('youtube-download-audio', {
        organizationId: 'org-1',
        transcriptId: 't-1',
        userId: 'user-1',
        youtubeId: 'yt-1',
        youtubeUrl: 'https://youtube.com/watch?v=yt-1',
      });

      await processor.process(job);

      expect(fs.unlinkSync).toHaveBeenCalled();
      expect(fs.rmdirSync).toHaveBeenCalled();
    });

    it('marks the transcript as failed and rethrows when the download fails', async () => {
      ytdlpService.downloadAudioLowestQuality.mockRejectedValueOnce(
        new Error('yt-dlp failed'),
      );
      const processor = buildProcessor();
      const job = createJob('youtube-download-audio', {
        organizationId: 'org-1',
        transcriptId: 't-1',
        userId: 'user-1',
        youtubeId: 'yt-1',
        youtubeUrl: 'https://youtube.com/watch?v=yt-1',
      });

      await expect(processor.process(job)).rejects.toThrow('yt-dlp failed');
      expect(httpService.patch).toHaveBeenCalledWith(
        expect.stringContaining('/transcripts/t-1'),
        expect.objectContaining({ status: 'failed' }),
      );
    });
  });

  describe('handleWhisperTranscription', () => {
    it('creates the whisper temp directory when missing', async () => {
      (fs.existsSync as Mock).mockReturnValue(false);
      const processor = buildProcessor();
      const job = createJob('whisper-transcribe', {
        audioUrl: 'https://cdn.example.com/audio.mp3',
        organizationId: 'org-1',
        transcriptId: 't-1',
        userId: 'user-1',
      });

      await processor.process(job);

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('whisper'),
        { recursive: true },
      );
    });

    it('marks the transcript as failed when the whisper API errors', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('whisper unavailable')),
      );
      const processor = buildProcessor();
      const job = createJob('whisper-transcribe', {
        audioUrl: 'https://cdn.example.com/audio.mp3',
        organizationId: 'org-1',
        transcriptId: 't-1',
        userId: 'user-1',
      });

      await expect(processor.process(job)).rejects.toThrow(
        'Whisper transcription failed: whisper unavailable',
      );
      expect(httpService.patch).toHaveBeenCalledWith(
        expect.stringContaining('/transcripts/t-1'),
        expect.objectContaining({ status: 'failed' }),
      );
    });
  });

  describe('handleUpload', () => {
    it('throws when the job is missing credentials', async () => {
      const processor = buildProcessor();
      const job = createJob('upload-youtube-unlisted', {
        organizationId: 'org-1',
        postId: 'post-1',
        userId: 'user-1',
      });

      await expect(processor.process(job)).rejects.toThrow(
        'Credential data missing from job',
      );
      expect(redisService.publish).toHaveBeenCalledWith(
        'youtube:upload:complete',
        expect.objectContaining({ status: 'failed' }),
      );
    });

    it.each([
      ['public', 'public'],
      ['private', 'private'],
      ['scheduled', 'scheduled'],
      [undefined, 'unlisted'],
    ])(
      'maps upload status %s to completion status %s',
      async (status, expected) => {
        const processor = buildProcessor();
        const job = createJob('upload-youtube', {
          credential: { accessToken: 'token' },
          organizationId: 'org-1',
          postId: 'post-1',
          status,
          userId: 'user-1',
        });

        await processor.process(job);

        expect(redisService.publish).toHaveBeenCalledWith(
          'youtube:upload:complete',
          expect.objectContaining({ status: expected }),
        );
      },
    );

    it('publishes a failed completion event and rethrows when upload fails', async () => {
      youtubeService.uploadVideo.mockRejectedValueOnce(
        new Error('upload rejected'),
      );
      const processor = buildProcessor();
      const job = createJob('upload-youtube', {
        credential: { accessToken: 'token' },
        organizationId: 'org-1',
        postId: 'post-1',
        userId: 'user-1',
      });

      await expect(processor.process(job)).rejects.toThrow('upload rejected');
      expect(redisService.publish).toHaveBeenCalledWith(
        'youtube:upload:complete',
        expect.objectContaining({ error: 'upload rejected', status: 'failed' }),
      );
    });

    it('logs but does not throw when publishing the completion event fails', async () => {
      redisService.publish.mockRejectedValueOnce(new Error('redis down'));
      const processor = buildProcessor();
      const job = createJob('upload-youtube', {
        credential: { accessToken: 'token' },
        organizationId: 'org-1',
        postId: 'post-1',
        userId: 'user-1',
      });

      const result = (await processor.process(job)) as { success: boolean };

      expect(result.success).toBe(true);
    });
  });
});
