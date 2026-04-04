// Break circular dependencies: both YoutubeAnalyticsService and YoutubeMetadataService import YoutubeService
vi.mock(
  '@api/services/integrations/youtube/services/modules/youtube-analytics.service',
  () => ({
    YoutubeAnalyticsService: vi.fn(),
  }),
);

vi.mock(
  '@api/services/integrations/youtube/services/modules/youtube-metadata.service',
  () => ({
    YoutubeMetadataService: vi.fn(),
  }),
);

import { CredentialEntity } from '@api/collections/credentials/entities/credential.entity';
import { PostEntity } from '@api/collections/posts/entities/post.entity';
import { ConfigService } from '@api/config/config.service';
import { YoutubeAnalyticsService } from '@api/services/integrations/youtube/services/modules/youtube-analytics.service';
import { YoutubeAuthService } from '@api/services/integrations/youtube/services/modules/youtube-auth.service';
import { YoutubeCommentsService } from '@api/services/integrations/youtube/services/modules/youtube-comments.service';
import { YoutubeMetadataService } from '@api/services/integrations/youtube/services/modules/youtube-metadata.service';
import { YoutubeUploadService } from '@api/services/integrations/youtube/services/modules/youtube-upload.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('YoutubeService', () => {
  let service: YoutubeService;
  let authService: vi.Mocked<YoutubeAuthService>;
  let metadataService: vi.Mocked<YoutubeMetadataService>;
  let uploadService: vi.Mocked<YoutubeUploadService>;
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
    } as unknown as vi.Mocked<YoutubeUploadService>;

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
        { provide: YoutubeUploadService, useValue: uploadService },
        { provide: YoutubeAnalyticsService, useValue: analyticsService },
        { provide: YoutubeCommentsService, useValue: { postComment: vi.fn() } },
      ],
    }).compile();

    service = module.get(YoutubeService);
  });

  it('should delegate metadata calls', async () => {
    metadataService.getVideoMetadata.mockResolvedValue({
      id: 'abc',
    } as unknown as CredentialEntity);

    await service.getVideoMetadata('abc');
    expect(metadataService.getVideoMetadata).toHaveBeenCalledWith('abc');
  });

  it('should delegate refresh token', async () => {
    await service.refreshToken('org', 'brand');
    expect(authService.refreshToken).toHaveBeenCalledWith('org', 'brand');
  });

  it('should delegate upload operations', async () => {
    await service.uploadVideo(
      'org',
      'brand',
      'video',
      {} as unknown as PostEntity,
    );
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
