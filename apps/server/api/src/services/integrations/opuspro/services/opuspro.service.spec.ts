import { ConfigService } from '@api/config/config.service';
import { ApiKeyHelperService } from '@api/services/api-key/api-key-helper.service';
import { OpusProService } from '@api/services/integrations/opuspro/services/opuspro.service';
import { ApiKeyCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, type TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: { getCallerName: vi.fn(() => 'testMethod') },
}));

describe('OpusProService', () => {
  let service: OpusProService;
  let httpService: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
  };
  let configService: { get: ReturnType<typeof vi.fn> };
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
  };
  let apiKeyHelperService: { getApiKey: ReturnType<typeof vi.fn> };

  const mockApiKey = 'test-api-key';
  const mockOrgId = new Types.ObjectId();
  const mockUserId = new Types.ObjectId();

  beforeEach(async () => {
    httpService = { get: vi.fn(), post: vi.fn() };
    configService = {
      get: vi.fn(() => 'https://webhooks.genfeed.ai'),
    };
    loggerService = { error: vi.fn(), log: vi.fn() };
    apiKeyHelperService = {
      getApiKey: vi.fn(() => mockApiKey),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpusProService,
        { provide: ConfigService, useValue: configService },
        { provide: LoggerService, useValue: loggerService },
        { provide: HttpService, useValue: httpService },
        { provide: ApiKeyHelperService, useValue: apiKeyHelperService },
      ],
    }).compile();

    service = module.get(OpusProService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateVideo', () => {
    it('should return videoId from response data.videoId', async () => {
      httpService.post.mockReturnValue(
        of({ data: { videoId: 'vid-123' }, status: 200 }),
      );

      const result = await service.generateVideo(
        'meta-1',
        'tpl-1',
        { param: 'value' },
        mockOrgId,
        mockUserId,
      );

      expect(result).toBe('vid-123');
      expect(apiKeyHelperService.getApiKey).toHaveBeenCalledWith(
        ApiKeyCategory.OPUS_PRO,
      );
    });

    it('should accept 201 status and return data.id fallback', async () => {
      httpService.post.mockReturnValue(
        of({ data: { id: 'vid-456' }, status: 201 }),
      );

      const result = await service.generateVideo('meta-2', 'tpl-2', {});
      expect(result).toBe('vid-456');
    });

    it('should throw when HTTP call throws', async () => {
      httpService.post.mockImplementation(() => {
        throw new Error('network error');
      });

      await expect(
        service.generateVideo('meta-3', 'tpl-3', {}),
      ).rejects.toThrow('network error');
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('should include callbackUrl and templateId in request body', async () => {
      httpService.post.mockReturnValue(
        of({ data: { videoId: 'v1' }, status: 200 }),
      );

      await service.generateVideo('meta-cb', 'tpl-cb', { a: 1 });

      expect(httpService.post).toHaveBeenCalledWith(
        expect.stringContaining('/v1/video/generate'),
        expect.objectContaining({
          callback_id: 'meta-cb',
          params: { a: 1 },
          templateId: 'tpl-cb',
        }),
        expect.objectContaining({
          headers: expect.objectContaining({ 'x-api-key': mockApiKey }),
        }),
      );
    });
  });

  describe('getVideoStatus', () => {
    it('should return status, videoUrl, and progress', async () => {
      httpService.get.mockReturnValue(
        of({
          data: {
            progress: 42,
            status: 'processing',
            videoUrl: 'https://cdn/v.mp4',
          },
          status: 200,
        }),
      );

      const result = await service.getVideoStatus(
        'vid-abc',
        mockOrgId,
        mockUserId,
      );

      expect(result).toEqual({
        error: undefined,
        progress: 42,
        status: 'processing',
        videoUrl: 'https://cdn/v.mp4',
      });
    });

    it('should fall back to video_url field', async () => {
      httpService.get.mockReturnValue(
        of({
          data: { status: 'done', video_url: 'https://cdn/v2.mp4' },
          status: 200,
        }),
      );

      const result = await service.getVideoStatus('vid-xyz');
      expect(result.videoUrl).toBe('https://cdn/v2.mp4');
    });

    it('should throw when status is not 200', async () => {
      httpService.get.mockReturnValue(of({ data: {}, status: 500 }));

      await expect(service.getVideoStatus('vid-fail')).rejects.toThrow(
        'Opus Pro API returned non-200 status',
      );
    });

    it('should log and rethrow errors', async () => {
      httpService.get.mockImplementation(() => {
        throw new Error('timeout');
      });

      await expect(service.getVideoStatus('vid-err')).rejects.toThrow(
        'timeout',
      );
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('getTemplates', () => {
    it('should map templates from data.templates', async () => {
      httpService.get.mockReturnValue(
        of({
          data: {
            templates: [
              {
                description: 'Desc',
                name: 'Template One',
                preview_url: 'https://img/1.jpg',
                templateId: 'tpl-1',
              },
            ],
          },
          status: 200,
        }),
      );

      const templates = await service.getTemplates(mockOrgId, mockUserId);
      expect(templates).toHaveLength(1);
      expect(templates[0]).toEqual({
        description: 'Desc',
        name: 'Template One',
        preview: 'https://img/1.jpg',
        templateId: 'tpl-1',
      });
    });

    it('should handle data.data array fallback', async () => {
      httpService.get.mockReturnValue(
        of({
          data: { data: [{ id: 'tpl-2', title: 'Tpl Two' }] },
          status: 200,
        }),
      );

      const templates = await service.getTemplates();
      expect(templates[0].templateId).toBe('tpl-2');
      expect(templates[0].name).toBe('Tpl Two');
    });

    it('should throw on non-200 status', async () => {
      httpService.get.mockReturnValue(of({ data: {}, status: 404 }));
      await expect(service.getTemplates()).rejects.toThrow(
        'Opus Pro API returned non-200 status',
      );
    });
  });

  describe('getAccountInfo', () => {
    it('should return plan, credits, and email', async () => {
      httpService.get.mockReturnValue(
        of({
          data: { credits: 500, email: 'user@test.com', plan: 'pro' },
          status: 200,
        }),
      );

      const info = await service.getAccountInfo(mockOrgId, mockUserId);
      expect(info).toEqual({
        credits: 500,
        email: 'user@test.com',
        plan: 'pro',
      });
    });

    it('should throw on non-200 response', async () => {
      httpService.get.mockReturnValue(of({ data: {}, status: 403 }));
      await expect(service.getAccountInfo()).rejects.toThrow(
        'Opus Pro API returned non-200 status',
      );
    });
  });
});
