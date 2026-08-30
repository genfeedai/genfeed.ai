import type { Mocked } from 'vitest';

// Break circular dependencies: both YoutubeAnalyticsService and YoutubeMetadataService import YoutubeService
vi.mock(
  '@server/services/integrations/youtube/services/modules/youtube-analytics.service',
  () => ({
    YoutubeAnalyticsService: vi.fn(),
  }),
);

vi.mock(
  '@server/services/integrations/youtube/services/modules/youtube-metadata.service',
  () => ({
    YoutubeMetadataService: vi.fn(),
  }),
);

const mockVideosList = vi.fn();

vi.mock('googleapis', () => ({
  google: {
    youtube: () => ({
      videos: { list: mockVideosList },
    }),
  },
}));

import { ConfigService } from '@libs/config/config.service';
import { Test, TestingModule } from '@nestjs/testing';
import {
  SERVER_TOKENS,
  type ServerYoutubeUploader,
} from '@server/server.dependencies';
import { YoutubeAnalyticsService } from '@server/services/integrations/youtube/services/modules/youtube-analytics.service';
import { YoutubeAuthService } from '@server/services/integrations/youtube/services/modules/youtube-auth.service';
import { YoutubeCommentsService } from '@server/services/integrations/youtube/services/modules/youtube-comments.service';
import { YoutubeMetadataService } from '@server/services/integrations/youtube/services/modules/youtube-metadata.service';
import { YoutubeService } from '@server/services/integrations/youtube/services/youtube.service';

describe('YoutubeService', () => {
  let service: YoutubeService;
  let authService: Mocked<YoutubeAuthService>;
  let metadataService: Mocked<YoutubeMetadataService>;
  let uploadService: Mocked<ServerYoutubeUploader>;
  let analyticsService: Mocked<YoutubeAnalyticsService>;

  beforeEach(async () => {
    vi.clearAllMocks();
    authService = {
      refreshToken: vi.fn(),
    } as unknown as Mocked<YoutubeAuthService>;

    metadataService = {
      getVideoMetadata: vi.fn(),
      getVideoStatus: vi.fn(),
    } as unknown as Mocked<YoutubeMetadataService>;

    uploadService = {
      uploadVideo: vi.fn(),
    } as unknown as Mocked<ServerYoutubeUploader>;

    analyticsService = {
      getChannelDetails: vi.fn(),
      getMediaAnalytics: vi.fn(),
      getMediaAnalyticsBatch: vi.fn(),
    } as unknown as Mocked<YoutubeAnalyticsService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YoutubeService,
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue('youtube-api-key') },
        },
        { provide: YoutubeAuthService, useValue: authService },
        { provide: YoutubeMetadataService, useValue: metadataService },
        { provide: SERVER_TOKENS.youtubeUploads, useValue: uploadService },
        { provide: YoutubeAnalyticsService, useValue: analyticsService },
        { provide: YoutubeCommentsService, useValue: { postComment: vi.fn() } },
      ],
    }).compile();

    service = module.get(YoutubeService);
  });

  it('should delegate metadata calls', async () => {
    metadataService.getVideoMetadata.mockResolvedValue({ id: 'abc' });

    await service.getVideoMetadata('abc');
    expect(metadataService.getVideoMetadata).toHaveBeenCalledWith('abc');
  });

  it('should delegate refresh token', async () => {
    await service.refreshToken('org', 'brand');
    expect(authService.refreshToken).toHaveBeenCalledWith(
      'org',
      'brand',
      undefined,
    );
  });

  it('should delegate upload operations', async () => {
    await service.uploadVideo('org', 'brand', 'video', {
      description: '',
      label: '',
      scheduledDate: new Date(),
    });
    expect(uploadService.uploadVideo).toHaveBeenCalled();
  });

  it('should delegate analytics operations', async () => {
    await service.getMediaAnalytics('org', 'brand', 'vid');
    expect(analyticsService.getMediaAnalytics).toHaveBeenCalled();
  });

  it('loads the native mostPopular chart and maps video signals', async () => {
    mockVideosList.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: 'video-1',
            snippet: {
              channelId: 'channel-1',
              channelTitle: 'Creator',
              description: 'Description',
              publishedAt: '2026-08-29T12:00:00Z',
              tags: ['ai', 'video'],
              thumbnails: { high: { url: 'https://img/video-1.jpg' } },
              title: 'Native trend',
            },
            statistics: {
              commentCount: '25',
              likeCount: '500',
              viewCount: '10000',
            },
          },
        ],
      },
    });

    await expect(service.getTrends('DE', 10)).resolves.toEqual([
      expect.objectContaining({
        commentCount: 25,
        id: 'video-1',
        likeCount: 500,
        title: 'Native trend',
        url: 'https://www.youtube.com/watch?v=video-1',
        viewCount: 10000,
      }),
    ]);
    expect(mockVideosList).toHaveBeenCalledWith({
      chart: 'mostPopular',
      maxResults: 10,
      part: ['id', 'snippet', 'statistics'],
      regionCode: 'DE',
    });
  });

  it('returns no native trends when the API key is absent', async () => {
    const module = await Test.createTestingModule({
      providers: [
        YoutubeService,
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue('') },
        },
        { provide: YoutubeAuthService, useValue: authService },
        { provide: YoutubeMetadataService, useValue: metadataService },
        { provide: SERVER_TOKENS.youtubeUploads, useValue: uploadService },
        { provide: YoutubeAnalyticsService, useValue: analyticsService },
        { provide: YoutubeCommentsService, useValue: { postComment: vi.fn() } },
      ],
    }).compile();
    const unconfiguredService = module.get(YoutubeService);

    await expect(unconfiguredService.getTrends()).resolves.toEqual([]);
    expect(mockVideosList).not.toHaveBeenCalled();
  });
});
