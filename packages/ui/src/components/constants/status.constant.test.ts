import {
  ArticleStatus,
  IngredientStatus,
  PostStatus,
  StatusDomain,
} from '@genfeedai/contracts';
import {
  ARTICLE_STATUS_METADATA,
  getStatusMeta,
  INGREDIENT_STATUS_METADATA,
  POST_STATUS_METADATA,
} from '@ui-constants/status.constant';
import { describe, expect, it } from 'vitest';

describe('status.constant', () => {
  describe('INGREDIENT_STATUS_METADATA', () => {
    it('should have metadata for DRAFT status', () => {
      const meta = INGREDIENT_STATUS_METADATA.get(IngredientStatus.DRAFT);

      expect(meta).toBeDefined();
      expect(meta?.label).toBe('Draft');
      expect(meta?.variant).toBe('ghost');
    });

    it('should have metadata for PROCESSING status', () => {
      const meta = INGREDIENT_STATUS_METADATA.get(IngredientStatus.PROCESSING);

      expect(meta).toBeDefined();
      expect(meta?.label).toBe('Processing');
      expect(meta?.variant).toBe('info');
    });

    it('should have metadata for UPLOADED status', () => {
      const meta = INGREDIENT_STATUS_METADATA.get(IngredientStatus.UPLOADED);

      expect(meta).toBeDefined();
      expect(meta?.label).toBe('Uploaded');
      expect(meta?.variant).toBe('ghost');
    });

    it('should have metadata for GENERATED status', () => {
      const meta = INGREDIENT_STATUS_METADATA.get(IngredientStatus.GENERATED);

      expect(meta).toBeDefined();
      expect(meta?.label).toBe('Completed');
      expect(meta?.variant).toBe('success');
    });

    it('should have metadata for VALIDATED status', () => {
      const meta = INGREDIENT_STATUS_METADATA.get(IngredientStatus.VALIDATED);

      expect(meta).toBeDefined();
      expect(meta?.label).toBe('Validated');
      expect(meta?.variant).toBe('success');
    });

    it('should have metadata for FAILED status', () => {
      const meta = INGREDIENT_STATUS_METADATA.get(IngredientStatus.FAILED);

      expect(meta).toBeDefined();
      expect(meta?.label).toBe('Failed');
      expect(meta?.variant).toBe('destructive');
    });

    it('should have metadata for ARCHIVED status', () => {
      const meta = INGREDIENT_STATUS_METADATA.get(IngredientStatus.ARCHIVED);

      expect(meta).toBeDefined();
      expect(meta?.label).toBe('Archived');
      expect(meta?.variant).toBe('warning');
    });

    it('should have metadata for REJECTED status', () => {
      const meta = INGREDIENT_STATUS_METADATA.get(IngredientStatus.REJECTED);

      expect(meta).toBeDefined();
      expect(meta?.label).toBe('Rejected');
      expect(meta?.variant).toBe('destructive');
    });
  });

  describe('ARTICLE_STATUS_METADATA', () => {
    it('should have metadata for DRAFT status', () => {
      const meta = ARTICLE_STATUS_METADATA.get(ArticleStatus.DRAFT);

      expect(meta).toBeDefined();
      expect(meta?.label).toBe('Draft');
      expect(meta?.variant).toBe('ghost');
    });

    it('should have metadata for PUBLISHED status', () => {
      const meta = ARTICLE_STATUS_METADATA.get(ArticleStatus.PUBLISHED);

      expect(meta).toBeDefined();
      expect(meta?.label).toBe('Published');
      expect(meta?.variant).toBe('success');
    });

    it('should have metadata for ARCHIVED status', () => {
      const meta = ARTICLE_STATUS_METADATA.get(ArticleStatus.ARCHIVED);

      expect(meta).toBeDefined();
      expect(meta?.label).toBe('Archived');
      expect(meta?.variant).toBe('warning');
    });
  });

  describe('POST_STATUS_METADATA', () => {
    it('should have metadata for DRAFT status', () => {
      const meta = POST_STATUS_METADATA.get(PostStatus.DRAFT);

      expect(meta).toBeDefined();
      expect(meta?.label).toBe('Draft');
      expect(meta?.variant).toBe('ghost');
    });

    it('should have metadata for SCHEDULED status', () => {
      const meta = POST_STATUS_METADATA.get(PostStatus.SCHEDULED);

      expect(meta).toBeDefined();
      expect(meta?.label).toBe('Scheduled');
      expect(meta?.variant).toBe('info');
    });

    it('should have metadata for PUBLIC status', () => {
      const meta = POST_STATUS_METADATA.get(PostStatus.PUBLIC);

      expect(meta).toBeDefined();
      expect(meta?.label).toBe('Public');
      expect(meta?.variant).toBe('success');
    });

    it('should have metadata for PRIVATE status', () => {
      const meta = POST_STATUS_METADATA.get(PostStatus.PRIVATE);

      expect(meta).toBeDefined();
      expect(meta?.label).toBe('Private');
      expect(meta?.variant).toBe('ghost');
    });

    it('should have metadata for UNLISTED status', () => {
      const meta = POST_STATUS_METADATA.get(PostStatus.UNLISTED);

      expect(meta).toBeDefined();
      expect(meta?.label).toBe('Unlisted');
      expect(meta?.variant).toBe('ghost');
    });

    it('should have metadata for PROCESSING status', () => {
      const meta = POST_STATUS_METADATA.get(PostStatus.PROCESSING);

      expect(meta).toBeDefined();
      expect(meta?.label).toBe('Processing');
      expect(meta?.variant).toBe('info');
    });

    it('should have metadata for PENDING status', () => {
      const meta = POST_STATUS_METADATA.get(PostStatus.PENDING);

      expect(meta).toBeDefined();
      expect(meta?.label).toBe('Verifying');
      expect(meta?.variant).toBe('info');
    });

    it('should have metadata for FAILED status', () => {
      const meta = POST_STATUS_METADATA.get(PostStatus.FAILED);

      expect(meta).toBeDefined();
      expect(meta?.label).toBe('Failed');
      expect(meta?.variant).toBe('destructive');
    });
  });

  /**
   * The #2485 review finding: article and post statuses shared the `'PUBLISHED'`
   * string in one flat map, so the post entry overwrote the article entry and
   * published articles rendered the post label. These guards fail if the
   * domains are ever merged back into a single keyspace.
   *
   * @see https://github.com/genfeedai/genfeed.ai/pull/2485#discussion_r3737427689
   */
  describe('cross-domain isolation', () => {
    it('keeps each domain map free of the other domains’ status values', () => {
      const articleValues = Object.values(ArticleStatus) as string[];
      const postValues = Object.values(PostStatus) as string[];
      const ingredientValues = Object.values(IngredientStatus) as string[];

      // Post statuses are lowercase product language; article and ingredient
      // statuses are SCREAMING_SNAKE Prisma labels. No map may answer for a
      // value that belongs exclusively to another domain.
      for (const value of postValues) {
        if (!articleValues.includes(value)) {
          expect(ARTICLE_STATUS_METADATA.has(value as ArticleStatus)).toBe(
            false,
          );
        }
        if (!ingredientValues.includes(value)) {
          expect(
            INGREDIENT_STATUS_METADATA.has(value as IngredientStatus),
          ).toBe(false);
        }
      }

      for (const value of articleValues) {
        if (!postValues.includes(value)) {
          expect(POST_STATUS_METADATA.has(value as PostStatus)).toBe(false);
        }
      }
    });

    it('resolves a value shared by two domains to each domain’s own entry', () => {
      // `IngredientStatus.GENERATED` and `ArticleStatus.PUBLISHED` are both
      // terminal success states but carry different labels — a shared keyspace
      // could not express that. DRAFT is shared verbatim across domains, so
      // each map must own its entry rather than borrow a neighbour's.
      expect(IngredientStatus.DRAFT.toString()).toBe(
        ArticleStatus.DRAFT.toString(),
      );

      expect(
        getStatusMeta(IngredientStatus.DRAFT, StatusDomain.INGREDIENT),
      ).toEqual(INGREDIENT_STATUS_METADATA.get(IngredientStatus.DRAFT));
      expect(getStatusMeta(ArticleStatus.DRAFT, StatusDomain.ARTICLE)).toEqual(
        ARTICLE_STATUS_METADATA.get(ArticleStatus.DRAFT),
      );
    });

    it('does not resolve an article status from the post domain', () => {
      const meta = getStatusMeta(ArticleStatus.PUBLISHED, StatusDomain.POST);

      // Falls back to the raw value instead of silently borrowing the post
      // `Public` label — the exact mislabel the flat map used to produce.
      expect(meta.label).toBe(ArticleStatus.PUBLISHED);
      expect(meta.variant).toBe('ghost');
    });
  });

  describe('getStatusMeta', () => {
    describe('Ingredient statuses', () => {
      it('should return correct meta for DRAFT', () => {
        const meta = getStatusMeta(
          IngredientStatus.DRAFT,
          StatusDomain.INGREDIENT,
        );

        expect(meta.label).toBe('Draft');
        expect(meta.variant).toBe('ghost');
      });

      it('should return correct meta for PROCESSING', () => {
        const meta = getStatusMeta(
          IngredientStatus.PROCESSING,
          StatusDomain.INGREDIENT,
        );

        expect(meta.label).toBe('Processing');
        expect(meta.variant).toBe('info');
      });

      it('should return correct meta for GENERATED', () => {
        const meta = getStatusMeta(
          IngredientStatus.GENERATED,
          StatusDomain.INGREDIENT,
        );

        expect(meta.label).toBe('Completed');
        expect(meta.variant).toBe('success');
      });

      it('should return correct meta for FAILED', () => {
        const meta = getStatusMeta(
          IngredientStatus.FAILED,
          StatusDomain.INGREDIENT,
        );

        expect(meta.label).toBe('Failed');
        expect(meta.variant).toBe('destructive');
      });
    });

    describe('Article statuses', () => {
      it('should return correct meta for PUBLISHED', () => {
        const meta = getStatusMeta(
          ArticleStatus.PUBLISHED,
          StatusDomain.ARTICLE,
        );

        expect(meta.label).toBe('Published');
        expect(meta.variant).toBe('success');
      });
    });

    describe('Post statuses', () => {
      it('should return correct meta for SCHEDULED', () => {
        const meta = getStatusMeta(PostStatus.SCHEDULED, StatusDomain.POST);

        expect(meta.label).toBe('Scheduled');
        expect(meta.variant).toBe('info');
      });
    });

    describe('fallback behavior', () => {
      it('should return fallback meta for unknown status', () => {
        const meta = getStatusMeta(
          'UNKNOWN_STATUS' as IngredientStatus,
          StatusDomain.INGREDIENT,
        );

        expect(meta.label).toBe('UNKNOWN_STATUS');
        expect(meta.variant).toBe('ghost');
      });

      it('should return status as label when not found in map', () => {
        const meta = getStatusMeta(
          'CUSTOM_STATUS' as ArticleStatus,
          StatusDomain.ARTICLE,
        );

        expect(meta.label).toBe('CUSTOM_STATUS');
        expect(meta.variant).toBe('ghost');
      });
    });
  });

  describe('variant consistency', () => {
    it('should use error variant for all failure states', () => {
      const failedIngredient = INGREDIENT_STATUS_METADATA.get(
        IngredientStatus.FAILED,
      );
      const rejectedIngredient = INGREDIENT_STATUS_METADATA.get(
        IngredientStatus.REJECTED,
      );
      const failedPost = POST_STATUS_METADATA.get(PostStatus.FAILED);

      expect(failedIngredient?.variant).toBe('destructive');
      expect(rejectedIngredient?.variant).toBe('destructive');
      expect(failedPost?.variant).toBe('destructive');
    });

    it('should use success variant for all success states', () => {
      const generatedIngredient = INGREDIENT_STATUS_METADATA.get(
        IngredientStatus.GENERATED,
      );
      const validatedIngredient = INGREDIENT_STATUS_METADATA.get(
        IngredientStatus.VALIDATED,
      );
      const publishedArticle = ARTICLE_STATUS_METADATA.get(
        ArticleStatus.PUBLISHED,
      );
      const publicPost = POST_STATUS_METADATA.get(PostStatus.PUBLIC);

      expect(generatedIngredient?.variant).toBe('success');
      expect(validatedIngredient?.variant).toBe('success');
      expect(publishedArticle?.variant).toBe('success');
      expect(publicPost?.variant).toBe('success');
    });

    it('should use warning variant for archived states', () => {
      const archivedIngredient = INGREDIENT_STATUS_METADATA.get(
        IngredientStatus.ARCHIVED,
      );
      const archivedArticle = ARTICLE_STATUS_METADATA.get(
        ArticleStatus.ARCHIVED,
      );

      expect(archivedIngredient?.variant).toBe('warning');
      expect(archivedArticle?.variant).toBe('warning');
    });

    it('should use info variant for processing states', () => {
      const processingIngredient = INGREDIENT_STATUS_METADATA.get(
        IngredientStatus.PROCESSING,
      );
      const scheduledPost = POST_STATUS_METADATA.get(PostStatus.SCHEDULED);
      const processingPost = POST_STATUS_METADATA.get(PostStatus.PROCESSING);
      const pendingPost = POST_STATUS_METADATA.get(PostStatus.PENDING);

      expect(processingIngredient?.variant).toBe('info');
      expect(scheduledPost?.variant).toBe('info');
      expect(processingPost?.variant).toBe('info');
      expect(pendingPost?.variant).toBe('info');
    });

    it('should use ghost variant for neutral states', () => {
      const draftIngredient = INGREDIENT_STATUS_METADATA.get(
        IngredientStatus.DRAFT,
      );
      const uploadedIngredient = INGREDIENT_STATUS_METADATA.get(
        IngredientStatus.UPLOADED,
      );
      const draftArticle = ARTICLE_STATUS_METADATA.get(ArticleStatus.DRAFT);
      const draftPost = POST_STATUS_METADATA.get(PostStatus.DRAFT);
      const privatePost = POST_STATUS_METADATA.get(PostStatus.PRIVATE);
      const unlistedPost = POST_STATUS_METADATA.get(PostStatus.UNLISTED);

      expect(draftIngredient?.variant).toBe('ghost');
      expect(uploadedIngredient?.variant).toBe('ghost');
      expect(draftArticle?.variant).toBe('ghost');
      expect(draftPost?.variant).toBe('ghost');
      expect(privatePost?.variant).toBe('ghost');
      expect(unlistedPost?.variant).toBe('ghost');
    });
  });

  describe('metadata completeness', () => {
    it('should have entries for all ingredient statuses', () => {
      const ingredientStatuses = [
        IngredientStatus.DRAFT,
        IngredientStatus.PROCESSING,
        IngredientStatus.UPLOADED,
        IngredientStatus.GENERATED,
        IngredientStatus.VALIDATED,
        IngredientStatus.FAILED,
        IngredientStatus.ARCHIVED,
        IngredientStatus.REJECTED,
      ];

      ingredientStatuses.forEach((status) => {
        expect(INGREDIENT_STATUS_METADATA.has(status)).toBe(true);
      });
    });

    it('should have entries for all persisted article statuses', () => {
      // PROCESSING and FAILED are domain-only pipeline states that never reach
      // an article badge — see packages/contracts/src/enums/article.enum.ts.
      const articleStatuses = [
        ArticleStatus.DRAFT,
        ArticleStatus.PUBLISHED,
        ArticleStatus.ARCHIVED,
      ];

      articleStatuses.forEach((status) => {
        expect(ARTICLE_STATUS_METADATA.has(status)).toBe(true);
      });
    });

    it('should have entries for all post statuses', () => {
      const postStatuses = Object.values(PostStatus);

      postStatuses.forEach((status) => {
        expect(POST_STATUS_METADATA.has(status)).toBe(true);
      });
    });
  });
});
