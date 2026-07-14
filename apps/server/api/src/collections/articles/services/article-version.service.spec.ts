import { ArticleVersionService } from '@api/collections/articles/services/article-version.service';
import type { PromptsService } from '@api/collections/prompts/services/prompts.service';
import type { LoggerService } from '@libs/logger/logger.service';

describe('ArticleVersionService', () => {
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
  } as unknown as LoggerService;

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns only versions matching the full article ownership scope', async () => {
    const promptsService = {
      findAll: vi.fn().mockResolvedValue({
        docs: [
          {
            articleId: 'article_1',
            brandId: 'brand_1',
            enhanced: '{"title":"Version one"}',
            id: 'prompt_1',
            organizationId: 'org_1',
            original: 'Improve this',
            userId: 'user_1',
          },
          {
            articleId: 'article_1',
            brandId: 'brand_other',
            id: 'prompt_other',
            organizationId: 'org_1',
            userId: 'user_1',
          },
        ],
      }),
    } as unknown as PromptsService;
    const service = new ArticleVersionService(logger, promptsService);

    const result = await service.getArticleVersions(
      'article_1',
      'user_1',
      'org_1',
      'brand_1',
      vi.fn().mockResolvedValue({ id: 'article_1' }),
    );

    expect(result).toEqual({
      articleId: 'article_1',
      prompts: [
        {
          id: 'prompt_1',
          prompt: 'Improve this',
          result: '{"title":"Version one"}',
          version: 1,
        },
      ],
      totalVersions: 1,
    });
  });

  it('restores parsed content and returns the reloaded article', async () => {
    const promptsService = {
      findOne: vi.fn().mockResolvedValue({
        enhanced:
          '{"content":"Restored body","summary":"Restored summary","title":"Restored title"}',
      }),
    } as unknown as PromptsService;
    const service = new ArticleVersionService(logger, promptsService);
    const restored = { id: 'article_1', label: 'Restored title' };
    const findArticle = vi
      .fn()
      .mockResolvedValueOnce({ id: 'article_1' })
      .mockResolvedValueOnce(restored);
    const patchArticle = vi.fn().mockResolvedValue(restored);

    const result = await service.restoreArticleVersion(
      'article_1',
      'prompt_1',
      'user_1',
      'org_1',
      findArticle,
      patchArticle,
    );

    expect(patchArticle).toHaveBeenCalledWith('article_1', {
      content: 'Restored body',
      label: 'Restored title',
      summary: 'Restored summary',
    });
    expect(result).toBe(restored);
  });

  it('rejects corrupted version data without patching the article', async () => {
    const promptsService = {
      findOne: vi.fn().mockResolvedValue({ enhanced: '{broken' }),
    } as unknown as PromptsService;
    const service = new ArticleVersionService(logger, promptsService);
    const patchArticle = vi.fn();

    await expect(
      service.restoreArticleVersion(
        'article_1',
        'prompt_1',
        'user_1',
        'org_1',
        vi.fn().mockResolvedValue({ id: 'article_1' }),
        patchArticle,
      ),
    ).rejects.toThrow('Version data is corrupted');
    expect(patchArticle).not.toHaveBeenCalled();
  });
});
