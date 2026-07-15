import type { ArticleDocument } from '@api/collections/articles/schemas/article.schema';
import { ArticleReviewService } from '@api/collections/articles/services/article-review.service';
import type { ArticleTextGenerationService } from '@api/collections/articles/services/article-text-generation.service';

describe('ArticleReviewService', () => {
  it('generates and parses a bounded review rubric', async () => {
    const textGeneration = {
      generateTextWithModel: vi.fn().mockResolvedValue({
        charge: {
          amount: 3,
          inputTokens: 100,
          modelKey: 'review-model',
          outputTokens: 50,
        },
        output: JSON.stringify({
          issues: [
            {
              category: 'clarity',
              message: 'Tighten the opening',
              recommendation: 'Lead with the result',
              severity: 'high',
            },
          ],
          revisionInstructions: 'Rewrite the opening.',
          score: 82,
          strengths: ['Useful examples'],
          summary: 'Strong draft with a slow opening.',
        }),
      }),
    } as unknown as ArticleTextGenerationService;
    const service = new ArticleReviewService(textGeneration);
    const onBilling = vi.fn();

    const result = await service.reviewExistingArticle(
      {
        brand: 'brand_1',
        category: 'post',
        content: 'Article body',
        label: 'Article title',
        summary: 'Article summary',
      } as unknown as ArticleDocument,
      'org_1',
      { reviewModel: 'review-model' },
      { promptBuilder: {} },
      'clarity',
      onBilling,
    );

    expect(result).toMatchObject({
      revisionInstructions: 'Rewrite the opening.',
      score: 82,
      strengths: ['Useful examples'],
    });
    expect(onBilling).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 3, modelKey: 'review-model' }),
    );
  });
});
