import { ArticleRemixService } from '@api/collections/articles/services/article-remix.service';
import { ArticleCategory, ArticleScope, ArticleStatus } from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';

describe('ArticleRemixService', () => {
  it('copies normalized article fields into a scoped draft remix', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_234);
    const logger = { log: vi.fn() } as unknown as LoggerService;
    const service = new ArticleRemixService(logger);
    const findArticle = vi.fn().mockResolvedValue({
      category: ArticleCategory.POST,
      content: 'Original body',
      id: 'article_1',
      label: 'Original title',
      scope: ArticleScope.ORGANIZATION,
      slug: 'original-title',
      summary: 'Original summary',
      tags: ['one', 'two'],
    });
    const createArticle = vi.fn().mockResolvedValue({ id: 'article_remix' });

    const result = await service.createRemix(
      'article_1',
      'user_1',
      'org_1',
      'brand_1',
      { label: 'Custom remix' },
      findArticle,
      createArticle,
    );

    expect(createArticle).toHaveBeenCalledWith(
      {
        category: ArticleCategory.POST,
        content: 'Original body',
        label: 'Custom remix',
        scope: ArticleScope.ORGANIZATION,
        slug: 'original-title-remix-1234',
        status: ArticleStatus.DRAFT,
        summary: 'Original summary',
        tags: ['one', 'two'],
      },
      'user_1',
      'org_1',
      'brand_1',
    );
    expect(result).toEqual({ id: 'article_remix' });
  });
});
