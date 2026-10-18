import type { AdminGenerationReviewsQueryDto } from '@api/collections/ingredients/dto/admin-generation-reviews-query.dto';
import {
  buildAdminGenerationReviewsWhere,
  readActivityCredits,
} from '@api/collections/ingredients/utils/admin-generation-reviews.util';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

function query(
  partial: Partial<AdminGenerationReviewsQueryDto> = {},
): AdminGenerationReviewsQueryDto {
  return partial as AdminGenerationReviewsQueryDto;
}

describe('buildAdminGenerationReviewsWhere', () => {
  it('covers image, video and music generations that ran, failed or are running', () => {
    expect(buildAdminGenerationReviewsWhere(query())).toEqual({
      category: {
        in: [
          IngredientCategory.IMAGE,
          IngredientCategory.VIDEO,
          IngredientCategory.MUSIC,
        ],
      },
      isDeleted: false,
      status: {
        in: [
          IngredientStatus.PROCESSING,
          IngredientStatus.GENERATED,
          IngredientStatus.FAILED,
        ],
      },
    });
  });

  it('narrows to one status, type, organization, brand and model', () => {
    expect(
      buildAdminGenerationReviewsWhere(
        query({
          brandId: 'brand-1',
          category: IngredientCategory.VIDEO,
          model: 'veo',
          organizationId: 'org-1',
          status: IngredientStatus.FAILED,
        }),
      ),
    ).toEqual({
      brandId: 'brand-1',
      category: IngredientCategory.VIDEO,
      isDeleted: false,
      modelUsed: { contains: 'veo', mode: 'insensitive' },
      organizationId: 'org-1',
      status: IngredientStatus.FAILED,
    });
  });

  it('searches prompts, the compiled prompt, the user email and the id', () => {
    const where = buildAdminGenerationReviewsWhere(
      query({ search: '  sunset ' }),
    );

    expect(where.OR).toEqual([
      { id: 'sunset' },
      { generationPrompt: { contains: 'sunset', mode: 'insensitive' } },
      {
        prompt: {
          is: {
            OR: [
              { original: { contains: 'sunset', mode: 'insensitive' } },
              { enhanced: { contains: 'sunset', mode: 'insensitive' } },
            ],
          },
        },
      },
      { user: { is: { email: { contains: 'sunset', mode: 'insensitive' } } } },
    ]);
  });

  it('ignores a blank search', () => {
    expect(
      buildAdminGenerationReviewsWhere(query({ search: '   ' })),
    ).not.toHaveProperty('OR');
  });
});

describe('readActivityCredits', () => {
  it('reads credits from the JSON string the ledger writes onto the activity', () => {
    expect(
      readActivityCredits({ value: JSON.stringify({ credits: 12.5 }) }),
    ).toBe(12.5);
  });

  it.each([
    null,
    'text',
    { value: 3 },
    { value: 'not json' },
    { value: JSON.stringify({ credits: 'many' }) },
    { value: JSON.stringify({}) },
  ])('returns null for %j', (data) => {
    expect(readActivityCredits(data)).toBeNull();
  });
});
