import { ArticleStatus, IngredientStatus, PostStatus } from '@genfeedai/enums';
import { getStatusMeta, STATUS_METADATA } from '@ui-constants/status.constant';
import { describe, expect, it } from 'vitest';

describe('status.constant', () => {
  describe('STATUS_METADATA', () => {
    describe('Ingredient statuses', () => {
      it('should have metadata for DRAFT status', () => {
        const meta = STATUS_METADATA.get(IngredientStatus.DRAFT);

        expect(meta).toBeDefined();
        expect(meta?.label).toBe('Draft');
        expect(meta?.variant).toBe('ghost');
      });

      it('should have metadata for PROCESSING status', () => {
        const meta = STATUS_METADATA.get(IngredientStatus.PROCESSING);

        expect(meta).toBeDefined();
        expect(meta?.label).toBe('Processing');
        expect(meta?.variant).toBe('info');
      });

      it('should have metadata for UPLOADED status', () => {
        const meta = STATUS_METADATA.get(IngredientStatus.UPLOADED);

        expect(meta).toBeDefined();
        expect(meta?.label).toBe('Uploaded');
        expect(meta?.variant).toBe('ghost');
      });

      it('should have metadata for GENERATED status', () => {
        const meta = STATUS_METADATA.get(IngredientStatus.GENERATED);

        expect(meta).toBeDefined();
        expect(meta?.label).toBe('Completed');
        expect(meta?.variant).toBe('success');
      });

      it('should have metadata for VALIDATED status', () => {
        const meta = STATUS_METADATA.get(IngredientStatus.VALIDATED);

        expect(meta).toBeDefined();
        expect(meta?.label).toBe('Validated');
        expect(meta?.variant).toBe('success');
      });

      it('should have metadata for FAILED status', () => {
        const meta = STATUS_METADATA.get(IngredientStatus.FAILED);

        expect(meta).toBeDefined();
        expect(meta?.label).toBe('Failed');
        expect(meta?.variant).toBe('destructive');
      });

      it('should have metadata for ARCHIVED status', () => {
        const meta = STATUS_METADATA.get(IngredientStatus.ARCHIVED);

        expect(meta).toBeDefined();
        expect(meta?.label).toBe('Archived');
        expect(meta?.variant).toBe('warning');
      });

      it('should have metadata for REJECTED status', () => {
        const meta = STATUS_METADATA.get(IngredientStatus.REJECTED);

        expect(meta).toBeDefined();
        expect(meta?.label).toBe('Rejected');
        expect(meta?.variant).toBe('destructive');
      });
    });

    describe('Article statuses', () => {
      it('should have metadata for DRAFT status', () => {
        const meta = STATUS_METADATA.get(ArticleStatus.DRAFT);

        expect(meta).toBeDefined();
        expect(meta?.label).toBe('Draft');
        expect(meta?.variant).toBe('ghost');
      });

      it('should have metadata for PUBLIC status', () => {
        const meta = STATUS_METADATA.get(ArticleStatus.PUBLIC);

        expect(meta).toBeDefined();
        // Note: ArticleStatus.PUBLIC and PostStatus.PUBLIC share the same enum value,
        // so the Map stores the later entry (PostStatus with label 'Public')
        expect(meta?.label).toBe('Public');
        expect(meta?.variant).toBe('success');
      });

      it('should have metadata for ARCHIVED status', () => {
        const meta = STATUS_METADATA.get(ArticleStatus.ARCHIVED);

        expect(meta).toBeDefined();
        expect(meta?.label).toBe('Archived');
        expect(meta?.variant).toBe('warning');
      });
    });

    describe('Post statuses', () => {
      it('should have metadata for DRAFT status', () => {
        const meta = STATUS_METADATA.get(PostStatus.DRAFT);

        expect(meta).toBeDefined();
        expect(meta?.label).toBe('Draft');
        expect(meta?.variant).toBe('ghost');
      });

      it('should have metadata for SCHEDULED status', () => {
        const meta = STATUS_METADATA.get(PostStatus.SCHEDULED);

        expect(meta).toBeDefined();
        expect(meta?.label).toBe('Scheduled');
        expect(meta?.variant).toBe('info');
      });

      it('should have metadata for PUBLIC status', () => {
        const meta = STATUS_METADATA.get(PostStatus.PUBLIC);

        expect(meta).toBeDefined();
        expect(meta?.label).toBe('Public');
        expect(meta?.variant).toBe('success');
      });

      it('should have metadata for PRIVATE status', () => {
        const meta = STATUS_METADATA.get(PostStatus.PRIVATE);

        expect(meta).toBeDefined();
        expect(meta?.label).toBe('Private');
        expect(meta?.variant).toBe('ghost');
      });

      it('should have metadata for UNLISTED status', () => {
        const meta = STATUS_METADATA.get(PostStatus.UNLISTED);

        expect(meta).toBeDefined();
        expect(meta?.label).toBe('Unlisted');
        expect(meta?.variant).toBe('ghost');
      });

      it('should have metadata for PROCESSING status', () => {
        const meta = STATUS_METADATA.get(PostStatus.PROCESSING);

        expect(meta).toBeDefined();
        expect(meta?.label).toBe('Processing');
        expect(meta?.variant).toBe('info');
      });

      it('should have metadata for FAILED status', () => {
        const meta = STATUS_METADATA.get(PostStatus.FAILED);

        expect(meta).toBeDefined();
        expect(meta?.label).toBe('Failed');
        expect(meta?.variant).toBe('destructive');
      });
    });
  });

  describe('getStatusMeta', () => {
    describe('Ingredient statuses', () => {
      it('should return correct meta for DRAFT', () => {
        const meta = getStatusMeta(IngredientStatus.DRAFT);

        expect(meta.label).toBe('Draft');
        expect(meta.variant).toBe('ghost');
      });

      it('should return correct meta for PROCESSING', () => {
        const meta = getStatusMeta(IngredientStatus.PROCESSING);

        expect(meta.label).toBe('Processing');
        expect(meta.variant).toBe('info');
      });

      it('should return correct meta for GENERATED', () => {
        const meta = getStatusMeta(IngredientStatus.GENERATED);

        expect(meta.label).toBe('Completed');
        expect(meta.variant).toBe('success');
      });

      it('should return correct meta for FAILED', () => {
        const meta = getStatusMeta(IngredientStatus.FAILED);

        expect(meta.label).toBe('Failed');
        expect(meta.variant).toBe('destructive');
      });
    });

    describe('Article statuses', () => {
      it('should return correct meta for PUBLIC', () => {
        const meta = getStatusMeta(ArticleStatus.PUBLIC);

        expect(meta.label).toBe('Public');
        expect(meta.variant).toBe('success');
      });
    });

    describe('Post statuses', () => {
      it('should return correct meta for SCHEDULED', () => {
        const meta = getStatusMeta(PostStatus.SCHEDULED);

        expect(meta.label).toBe('Scheduled');
        expect(meta.variant).toBe('info');
      });
    });

    describe('fallback behavior', () => {
      it('should return fallback meta for unknown status', () => {
        const meta = getStatusMeta('UNKNOWN_STATUS' as IngredientStatus);

        expect(meta.label).toBe('UNKNOWN_STATUS');
        expect(meta.variant).toBe('ghost');
      });

      it('should return status as label when not found in map', () => {
        const meta = getStatusMeta('CUSTOM_STATUS' as ArticleStatus);

        expect(meta.label).toBe('CUSTOM_STATUS');
        expect(meta.variant).toBe('ghost');
      });
    });
  });

  describe('variant consistency', () => {
    it('should use error variant for all failure states', () => {
      const failedIngredient = STATUS_METADATA.get(IngredientStatus.FAILED);
      const rejectedIngredient = STATUS_METADATA.get(IngredientStatus.REJECTED);
      const failedPost = STATUS_METADATA.get(PostStatus.FAILED);

      expect(failedIngredient?.variant).toBe('destructive');
      expect(rejectedIngredient?.variant).toBe('destructive');
      expect(failedPost?.variant).toBe('destructive');
    });

    it('should use success variant for all success states', () => {
      const generatedIngredient = STATUS_METADATA.get(
        IngredientStatus.GENERATED,
      );
      const validatedIngredient = STATUS_METADATA.get(
        IngredientStatus.VALIDATED,
      );
      const publicArticle = STATUS_METADATA.get(ArticleStatus.PUBLIC);
      const publicPost = STATUS_METADATA.get(PostStatus.PUBLIC);

      expect(generatedIngredient?.variant).toBe('success');
      expect(validatedIngredient?.variant).toBe('success');
      expect(publicArticle?.variant).toBe('success');
      expect(publicPost?.variant).toBe('success');
    });

    it('should use warning variant for archived states', () => {
      const archivedIngredient = STATUS_METADATA.get(IngredientStatus.ARCHIVED);
      const archivedArticle = STATUS_METADATA.get(ArticleStatus.ARCHIVED);

      expect(archivedIngredient?.variant).toBe('warning');
      expect(archivedArticle?.variant).toBe('warning');
    });

    it('should use info variant for processing states', () => {
      const processingIngredient = STATUS_METADATA.get(
        IngredientStatus.PROCESSING,
      );
      const scheduledPost = STATUS_METADATA.get(PostStatus.SCHEDULED);
      const processingPost = STATUS_METADATA.get(PostStatus.PROCESSING);

      expect(processingIngredient?.variant).toBe('info');
      expect(scheduledPost?.variant).toBe('info');
      expect(processingPost?.variant).toBe('info');
    });

    it('should use ghost variant for neutral states', () => {
      const draftIngredient = STATUS_METADATA.get(IngredientStatus.DRAFT);
      const uploadedIngredient = STATUS_METADATA.get(IngredientStatus.UPLOADED);
      const draftArticle = STATUS_METADATA.get(ArticleStatus.DRAFT);
      const draftPost = STATUS_METADATA.get(PostStatus.DRAFT);
      const privatePost = STATUS_METADATA.get(PostStatus.PRIVATE);
      const unlistedPost = STATUS_METADATA.get(PostStatus.UNLISTED);

      expect(draftIngredient?.variant).toBe('ghost');
      expect(uploadedIngredient?.variant).toBe('ghost');
      expect(draftArticle?.variant).toBe('ghost');
      expect(draftPost?.variant).toBe('ghost');
      expect(privatePost?.variant).toBe('ghost');
      expect(unlistedPost?.variant).toBe('ghost');
    });
  });

  describe('STATUS_METADATA completeness', () => {
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
        expect(STATUS_METADATA.has(status)).toBe(true);
      });
    });

    it('should have entries for all article statuses', () => {
      const articleStatuses = [
        ArticleStatus.DRAFT,
        ArticleStatus.PUBLIC,
        ArticleStatus.ARCHIVED,
      ];

      articleStatuses.forEach((status) => {
        expect(STATUS_METADATA.has(status)).toBe(true);
      });
    });

    it('should have entries for all post statuses', () => {
      const postStatuses = [
        PostStatus.DRAFT,
        PostStatus.SCHEDULED,
        PostStatus.PUBLIC,
        PostStatus.PRIVATE,
        PostStatus.UNLISTED,
        PostStatus.PROCESSING,
        PostStatus.FAILED,
      ];

      postStatuses.forEach((status) => {
        expect(STATUS_METADATA.has(status)).toBe(true);
      });
    });
  });
});
