import { PublicNewslettersController } from '@api/endpoints/public/controllers/newsletters/public.newsletters.controller';
import { NewsletterImportFeedService } from '@api/endpoints/public/services/newsletter-import-feed.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('PublicNewslettersController', () => {
  let controller: PublicNewslettersController;
  let newsletterImportFeedService: {
    generateCanonicalPage: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    newsletterImportFeedService = {
      generateCanonicalPage: vi.fn().mockResolvedValue('<!doctype html>'),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicNewslettersController],
      providers: [
        {
          provide: NewsletterImportFeedService,
          useValue: newsletterImportFeedService,
        },
      ],
    }).compile();

    controller = module.get(PublicNewslettersController);
  });

  afterEach(() => vi.clearAllMocks());

  it('returns the canonical public newsletter page', async () => {
    await expect(
      controller.getCanonicalNewsletterPage('newsletter-1'),
    ).resolves.toBe('<!doctype html>');
    expect(
      newsletterImportFeedService.generateCanonicalPage,
    ).toHaveBeenCalledWith('newsletter-1');
  });
});
