import { ApiKeyHelperService } from '@api/services/api-key/api-key-helper.service';
import { ByokService } from '@api/services/byok/byok.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';

import { HeygenAvatarProvider } from './heygen-avatar.provider';

describe('HeygenAvatarProvider', () => {
  let provider: HeygenAvatarProvider;
  let byokService: { resolveApiKey: ReturnType<typeof vi.fn> };
  let apiKeyHelperService: { getApiKey: ReturnType<typeof vi.fn> };
  let httpService: { get: ReturnType<typeof vi.fn> };
  let heygenService: { generateAvatarVideo: ReturnType<typeof vi.fn> };
  let loggerService: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    byokService = { resolveApiKey: vi.fn() };
    apiKeyHelperService = { getApiKey: vi.fn() };
    httpService = { get: vi.fn() };
    heygenService = { generateAvatarVideo: vi.fn() };
    loggerService = { error: vi.fn(), log: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HeygenAvatarProvider,
        { provide: HeyGenService, useValue: heygenService },
        { provide: ByokService, useValue: byokService },
        { provide: HttpService, useValue: httpService },
        { provide: LoggerService, useValue: loggerService },
        { provide: ApiKeyHelperService, useValue: apiKeyHelperService },
      ],
    }).compile();

    provider = module.get<HeygenAvatarProvider>(HeygenAvatarProvider);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('exposes providerName as heygen', () => {
    expect(provider.providerName).toBe('heygen');
  });

  describe('getStatus', () => {
    it('calls HeyGen status endpoint with BYOK key when present', async () => {
      byokService.resolveApiKey.mockResolvedValue({ apiKey: 'byok-xyz' });
      httpService.get.mockReturnValue(
        of({
          data: {
            data: { status: 'completed', video_url: 'https://hg/video.mp4' },
          },
        }),
      );

      const result = await provider.getStatus('video-1', 'org-1');

      expect(byokService.resolveApiKey).toHaveBeenCalledWith('org-1', 'heygen');
      expect(httpService.get).toHaveBeenCalledWith(
        'https://api.heygen.com/v1/video_status.get',
        expect.objectContaining({
          headers: { 'X-Api-Key': 'byok-xyz' },
          params: { video_id: 'video-1' },
        }),
      );
      expect(result).toEqual({
        jobId: 'video-1',
        providerName: 'heygen',
        status: 'completed',
        videoUrl: 'https://hg/video.mp4',
      });
    });

    it('falls back to env HEYGEN_KEY when BYOK returns undefined', async () => {
      byokService.resolveApiKey.mockResolvedValue(undefined);
      apiKeyHelperService.getApiKey.mockReturnValue('env-key-abc');
      httpService.get.mockReturnValue(
        of({ data: { data: { status: 'processing' } } }),
      );

      const result = await provider.getStatus('video-2', 'org-2');

      expect(httpService.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: { 'X-Api-Key': 'env-key-abc' },
        }),
      );
      expect(result.status).toBe('processing');
    });

    it('returns failed status when no API key is resolvable', async () => {
      byokService.resolveApiKey.mockResolvedValue(undefined);
      apiKeyHelperService.getApiKey.mockReturnValue('');

      const result = await provider.getStatus('video-3', 'org-3');

      expect(httpService.get).not.toHaveBeenCalled();
      expect(result.status).toBe('failed');
      expect(result.error).toContain('No HeyGen API key configured');
    });

    it('never ships an empty api key in headers (regression guard)', async () => {
      byokService.resolveApiKey.mockResolvedValue({ apiKey: 'valid' });
      httpService.get.mockReturnValue(
        of({ data: { data: { status: 'processing' } } }),
      );

      await provider.getStatus('video-4', 'org-4');

      const callArgs = httpService.get.mock.calls[0];
      const config = callArgs[1] as { headers: Record<string, string> };
      expect(config.headers['X-Api-Key']).not.toBe('');
      expect(config.headers['X-Api-Key']).toBeTruthy();
    });
  });
});
