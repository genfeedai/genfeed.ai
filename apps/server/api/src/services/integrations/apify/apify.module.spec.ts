import { ApifyModule } from '@api/services/integrations/apify/apify.module';
import { ApifyBaseService } from '@api/services/integrations/apify/services/modules/apify-base.service';
import { ApifyInstagramService } from '@api/services/integrations/apify/services/modules/apify-instagram.service';
import { ApifyLinkedInService } from '@api/services/integrations/apify/services/modules/apify-linkedin.service';
import { ApifyTikTokService } from '@api/services/integrations/apify/services/modules/apify-tiktok.service';
import { ApifyTwitterService } from '@api/services/integrations/apify/services/modules/apify-twitter.service';
import { ApifyYouTubeService } from '@api/services/integrations/apify/services/modules/apify-youtube.service';
import { ResearchCollectionRunner } from '@api/services/research-access/research-collection-runner.service';
import { Test } from '@nestjs/testing';

describe('ApifyModule', () => {
  it('should be defined', () => {
    expect(ApifyModule).toBeDefined();
  });
  it('provides the durable runner and resolves all five platform constructor dependencies', async () => {
    const platforms = [
      ApifyTwitterService,
      ApifyInstagramService,
      ApifyTikTokService,
      ApifyYouTubeService,
      ApifyLinkedInService,
    ];
    const providers = Reflect.getMetadata(
      'providers',
      ApifyModule,
    ) as unknown[];
    expect(providers).toContain(ResearchCollectionRunner);
    for (const platform of platforms) expect(providers).toContain(platform);
    const module = await Test.createTestingModule({
      providers: [
        ...platforms,
        { provide: ApifyBaseService, useValue: {} },
        { provide: ResearchCollectionRunner, useValue: { run: vi.fn() } },
      ],
    }).compile();
    for (const platform of platforms)
      expect(module.get(platform)).toBeDefined();
    await module.close();
  });
});
