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
  let authService: vi.Mocked<YoutubeAuthService>;
  let metadataService: vi.Mocked<YoutubeMetadataService>;
  let uploadService: vi.Mocked<ServerYoutubeUploader>;
  let analyticsService: vi.Mocked<YoutubeAnalyticsService>;

  beforeEach(async () => {
    authService = {
      refreshToken: vi.fn(),
    } as unknown as vi.Mocked<YoutubeAuthService>;

    metadataService = {
      getVideoMetadata: vi.fn(),
      getVideoStatus: vi.fn(),
    } as unknown as vi.Mocked<YoutubeMetadataService>;

    uploadService = {
      uploadVideo: vi.fn(),
    } as unknown as vi.Mocked<ServerYoutubeUploader>;

    analyticsService = {
      getChannelDetails: vi.fn(),
      getMediaAnalytics: vi.fn(),
      getMediaAnalyticsBatch: vi.fn(),
      getTrends: vi.fn(),
    } as unknown as vi.Mocked<YoutubeAnalyticsService>;

    const module: TestingModule = await Test.createTestingModule({
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
    await service.getTrends('org', 'brand');
    expect(analyticsService.getTrends).toHaveBeenCalledWith(
      'org',
      'brand',
      'US',
    );

    await service.getMediaAnalytics('org', 'brand', 'vid');
    expect(analyticsService.getMediaAnalytics).toHaveBeenCalled();
  });
});
