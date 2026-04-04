import { ConfigService } from '@api/config/config.service';
import { YoutubeAuthService } from '@api/services/integrations/youtube/services/modules/youtube-auth.service';
import { YoutubeMetadataService } from '@api/services/integrations/youtube/services/modules/youtube-metadata.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

const mockVideosList = vi.fn();

vi.mock('googleapis', () => ({
  google: {
    youtube: () => ({
      videos: { list: mockVideosList },
    }),
  },
}));

describe('YoutubeMetadataService', () => {
  let service: YoutubeMetadataService;
  let authService: { refreshToken: ReturnType<typeof vi.fn> };
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const mockAuth = { credentials: { access_token: 'test-token' } };

  beforeEach(async () => {
    vi.clearAllMocks();

    authService = {
      refreshToken: vi.fn().mockResolvedValue(mockAuth),
    };

    loggerService = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YoutubeMetadataService,
        { provide: LoggerService, useValue: loggerService },
        { provide: YoutubeAuthService, useValue: authService },
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue('test-api-key') },
        },
      ],
    }).compile();

    service = module.get<YoutubeMetadataService>(YoutubeMetadataService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // --- getVideoMetadata ---

  it('should return video metadata for a valid video', async () => {
    mockVideosList.mockResolvedValueOnce({
      data: {
        items: [
          {
            contentDetails: {
              duration: 'PT10M30S',
            },
            snippet: {
              categoryId: '22',
              description: 'A great video',
              publishedAt: '2024-01-15T10:00:00Z',
              tags: ['ai', 'tech'],
              title: 'Test Video',
            },
            statistics: {
              likeCount: '200',
              viewCount: '5000',
            },
          },
        ],
      },
    });

    const result = await service.getVideoMetadata('vid-123');

    expect(result).toEqual({
      categoryId: '22',
      description: 'A great video',
      duration: 630,
      id: 'vid-123',
      likeCount: 200,
      publishedAt: new Date('2024-01-15T10:00:00Z'),
      tags: ['ai', 'tech'],
      title: 'Test Video',
      viewCount: 5000,
    });
  });

  it('should return null when video is not found', async () => {
    mockVideosList.mockResolvedValueOnce({
      data: { items: [] },
    });

    const result = await service.getVideoMetadata('nonexistent');
    expect(result).toBeNull();
    expect(loggerService.warn).toHaveBeenCalled();
  });

  it('should return null on API error', async () => {
    mockVideosList.mockRejectedValueOnce(new Error('API error'));

    const result = await service.getVideoMetadata('vid-err');
    expect(result).toBeNull();
    expect(loggerService.error).toHaveBeenCalled();
  });

  it('should handle missing optional fields gracefully', async () => {
    mockVideosList.mockResolvedValueOnce({
      data: {
        items: [
          {
            contentDetails: {},
            snippet: {},
            statistics: {},
          },
        ],
      },
    });

    const result = await service.getVideoMetadata('vid-sparse');

    expect(result).toEqual({
      categoryId: undefined,
      description: undefined,
      duration: 0,
      id: 'vid-sparse',
      likeCount: undefined,
      publishedAt: undefined,
      tags: undefined,
      title: undefined,
      viewCount: undefined,
    });
  });

  it('should parse hours-only duration correctly', async () => {
    mockVideosList.mockResolvedValueOnce({
      data: {
        items: [
          {
            contentDetails: { duration: 'PT2H' },
            snippet: { title: 'Long Video' },
            statistics: { viewCount: '100' },
          },
        ],
      },
    });

    const result = await service.getVideoMetadata('vid-long');
    expect(result?.duration).toBe(7200);
  });

  // --- getVideoStatus ---

  it('should return video status with privacy and upload status', async () => {
    mockVideosList.mockResolvedValueOnce({
      data: {
        items: [
          {
            status: {
              privacyStatus: 'public',
              publishAt: null,
              uploadStatus: 'processed',
            },
          },
        ],
      },
    });

    const result = await service.getVideoStatus(
      'org-1',
      'brand-1',
      'vid-status',
    );

    expect(result).toEqual({
      privacyStatus: 'public',
      publishAt: undefined,
      uploadStatus: 'processed',
    });
    expect(authService.refreshToken).toHaveBeenCalledWith('org-1', 'brand-1');
  });

  it('should throw when video not found in getVideoStatus', async () => {
    mockVideosList.mockResolvedValueOnce({
      data: { items: [] },
    });

    await expect(
      service.getVideoStatus('org-1', 'brand-1', 'vid-missing'),
    ).rejects.toThrow('Video not found or status not available');
  });

  it('should throw when video status object is null', async () => {
    mockVideosList.mockResolvedValueOnce({
      data: {
        items: [{ status: null }],
      },
    });

    await expect(
      service.getVideoStatus('org-1', 'brand-1', 'vid-nostatus'),
    ).rejects.toThrow('Video not found or status not available');
  });

  it('should rethrow API errors from getVideoStatus', async () => {
    mockVideosList.mockRejectedValueOnce(new Error('Forbidden'));

    await expect(
      service.getVideoStatus('org-1', 'brand-1', 'vid-err'),
    ).rejects.toThrow('Forbidden');
    expect(loggerService.error).toHaveBeenCalled();
  });

  it('should return publishAt when set on a scheduled video', async () => {
    mockVideosList.mockResolvedValueOnce({
      data: {
        items: [
          {
            status: {
              privacyStatus: 'private',
              publishAt: '2025-06-01T12:00:00Z',
              uploadStatus: 'processed',
            },
          },
        ],
      },
    });

    const result = await service.getVideoStatus(
      'org-1',
      'brand-1',
      'vid-sched',
    );
    expect(result.publishAt).toBe('2025-06-01T12:00:00Z');
    expect(result.privacyStatus).toBe('private');
  });

  it('should handle zero-second duration (PT0S)', async () => {
    mockVideosList.mockResolvedValueOnce({
      data: {
        items: [
          {
            contentDetails: { duration: 'PT0S' },
            snippet: { title: 'Zero' },
            statistics: { viewCount: '0' },
          },
        ],
      },
    });

    const result = await service.getVideoMetadata('vid-zero');
    expect(result?.duration).toBe(0);
  });
});
