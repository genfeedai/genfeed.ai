/**
 * @fileoverview Tests for ApifyLinkedInService
 */

import type { ApifyLinkedInPost } from '@api/services/integrations/apify/interfaces/apify.interfaces';
import { ApifyBaseService } from '@api/services/integrations/apify/services/modules/apify-base.service';
import { ApifyLinkedInService } from '@api/services/integrations/apify/services/modules/apify-linkedin.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('ApifyLinkedInService', () => {
  let service: ApifyLinkedInService;
  let baseService: vi.Mocked<ApifyBaseService>;

  const mockRawPost: ApifyLinkedInPost = {
    commentsCount: 5,
    id: 'post-001',
    likesCount: 40,
    postedAt: new Date().toISOString(),
    postUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:post-001',
    text: 'Great news for our customers',
  } as unknown as ApifyLinkedInPost;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApifyLinkedInService,
        {
          provide: ApifyBaseService,
          useValue: {
            ACTORS: {
              LINKEDIN_PROFILE_SCRAPER:
                'curious_coder/linkedin-profile-scraper',
            },
            getApiToken: vi.fn().mockReturnValue('test-token'),
            loggerService: {
              error: vi.fn(),
              log: vi.fn(),
              warn: vi.fn(),
            },
            runActor: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ApifyLinkedInService>(ApifyLinkedInService);
    baseService = module.get(ApifyBaseService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getLinkedInProfilePosts', () => {
    it('should return raw profile posts', async () => {
      baseService.runActor.mockResolvedValue([mockRawPost]);

      const result = await service.getLinkedInProfilePosts(
        'https://www.linkedin.com/in/testprofile',
        { limit: 10 },
      );

      expect(result).toEqual([mockRawPost]);
      expect(baseService.runActor).toHaveBeenCalledWith(
        baseService.ACTORS.LINKEDIN_PROFILE_SCRAPER,
        expect.objectContaining({
          maxPosts: 10,
          profileUrls: ['https://www.linkedin.com/in/testprofile'],
        }),
      );
    });

    it('should throw when APIFY_API_TOKEN is not configured', async () => {
      baseService.getApiToken.mockReturnValue(null);

      await expect(
        service.getLinkedInProfilePosts(
          'https://www.linkedin.com/in/testprofile',
        ),
      ).rejects.toThrow('APIFY_API_TOKEN is not configured');
    });

    it('should rethrow when the actor run fails', async () => {
      baseService.runActor.mockRejectedValue(new Error('Actor failed'));

      await expect(
        service.getLinkedInProfilePosts(
          'https://www.linkedin.com/in/testprofile',
        ),
      ).rejects.toThrow('Actor failed');
    });
  });
});
