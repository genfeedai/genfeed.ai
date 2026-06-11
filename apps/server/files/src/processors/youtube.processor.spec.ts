import type { ConfigService } from '@files/config/config.service';
import type { S3Service } from '@files/services/s3/s3.service';
import type { YoutubeService } from '@files/services/youtube/youtube.service';
import type { YtDlpService } from '@files/services/ytdlp/ytdlp.service';
import type { RedisService } from '@libs/redis/redis.service';
import type { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { YoutubeProcessor } from './youtube.processor';

type ProcessorInternals = {
  apiBaseUrl: string;
  updateTranscriptStatus(
    transcriptId: string,
    status: string,
    additionalData?: unknown,
  ): Promise<void>;
};

describe('YoutubeProcessor', () => {
  const configService = { get: vi.fn() };
  const httpService = {
    get: vi.fn(),
    patch: vi.fn().mockReturnValue(of({ data: {} })),
    post: vi.fn(),
  };

  function buildProcessor(): ProcessorInternals {
    return new YoutubeProcessor(
      configService as unknown as ConfigService,
      httpService as unknown as HttpService,
      {} as unknown as RedisService,
      {} as unknown as S3Service,
      {} as unknown as YtDlpService,
      {} as unknown as YoutubeService,
    ) as unknown as ProcessorInternals;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    httpService.patch.mockReturnValue(of({ data: {} }));
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
});
