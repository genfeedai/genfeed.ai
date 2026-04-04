import { PublicRSSController } from '@api/endpoints/public/controllers/rss/rss.controller';
import { RssService } from '@api/endpoints/public/services/rss.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { Test, TestingModule } from '@nestjs/testing';

describe('PublicRSSController', () => {
  let controller: PublicRSSController;
  let rssService: vi.Mocked<RssService>;

  const mockRssFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Genfeed Articles</title>
    <description>AI-powered content from Genfeed</description>
    <link>https://genfeed.ai</link>
  </channel>
</rss>`;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicRSSController],
      providers: [
        {
          provide: RssService,
          useValue: {
            generateBrandFeed: vi.fn(),
            generateGlobalFeed: vi.fn(),
            generateOrganizationFeed: vi.fn(),
            generateUserFeed: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PublicRSSController>(PublicRSSController);
    rssService = module.get(RssService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getGlobalFeed', () => {
    it('should return RSS feed string', async () => {
      rssService.generateGlobalFeed.mockResolvedValue(mockRssFeed);

      const result = await controller.getGlobalFeed();

      expect(rssService.generateGlobalFeed).toHaveBeenCalled();
      expect(result).toBe(mockRssFeed);
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Feed generation failed');
      rssService.generateGlobalFeed.mockRejectedValue(error);

      await expect(controller.getGlobalFeed()).rejects.toThrow(error);
    });
  });
});
