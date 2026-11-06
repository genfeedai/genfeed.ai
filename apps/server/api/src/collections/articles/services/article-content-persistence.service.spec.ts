import type { ArticleDocument } from '@api/collections/articles/schemas/article.schema';
import { ArticleContentPersistenceService } from '@api/collections/articles/services/article-content-persistence.service';
import type { ArticleCreateFn } from '@api/collections/articles/services/articles-content.types';
import type { TagsService } from '@api/collections/tags/services/tags.service';
import { delegateFindOneSelect } from '@api-test/mocks/service.mocks';
import {
  ArticleCategory,
  ArticleStatus,
  TagCategory,
} from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it } from 'vitest';

interface TagRow {
  brandId?: string;
  category?: string;
  id: string;
  isDeleted: boolean;
  label: string;
  organizationId: string;
  userId?: string;
}

describe('ArticleContentPersistenceService.persistGeneratedArticle', () => {
  const userId = 'user_1';
  const organizationId = 'org_1';
  const brandId = 'brand_1';

  let tags: TagRow[];
  let isTagStoreDown: boolean;
  let articles: Array<{
    brandId: string;
    data: Record<string, unknown>;
    organizationId: string;
    userId: string;
  }>;
  let service: ArticleContentPersistenceService;

  const createArticleFn: ArticleCreateFn = async (
    data,
    ownerId,
    orgId,
    ownerBrandId,
  ) => {
    articles.push({
      brandId: ownerBrandId,
      data: { ...data },
      organizationId: orgId,
      userId: ownerId,
    });
    return { id: `article_${articles.length}` } as unknown as ArticleDocument;
  };

  beforeEach(() => {
    tags = [
      {
        id: 'existing-tag-1',
        isDeleted: false,
        label: 'Growth',
        organizationId,
      },
      {
        id: 'other-org-tag',
        isDeleted: false,
        label: 'AI',
        organizationId: 'org_2',
      },
      { id: 'deleted-tag', isDeleted: true, label: 'AI', organizationId },
    ];
    isTagStoreDown = false;
    articles = [];

    service = new ArticleContentPersistenceService(
      {
        error: () => {},
        log: () => {},
        warn: () => {},
      } as unknown as LoggerService,
      {
        create: async (data: Omit<TagRow, 'id' | 'isDeleted'>) => {
          const row = {
            ...data,
            id: `created-tag-${tags.length}`,
            isDeleted: false,
          };
          tags.push(row);
          return row;
        },
        findOne: async (where: {
          isDeleted: boolean;
          label: { equals: string; mode: 'insensitive' };
          organizationId: string;
        }) => {
          if (isTagStoreDown) {
            throw new Error('db down');
          }
          return (
            tags.find(
              (row) =>
                row.isDeleted === where.isDeleted &&
                row.organizationId === where.organizationId &&
                row.label.toLowerCase() === where.label.equals.toLowerCase(),
            ) ?? null
          );
        },
        findOneSelect: delegateFindOneSelect(),
      } as unknown as TagsService,
    );
  });

  const draft = {
    content: '<p>Body</p>',
    label: 'Generated article',
    summary: 'Summary',
  };

  it('reuses org tags, creates missing ones once, and persists a draft', async () => {
    await service.persistGeneratedArticle({
      brandId,
      category: ArticleCategory.POST,
      createArticleFn,
      draft,
      organizationId,
      slug: 'generated-article',
      tagLabels: ['growth', 'AI', 'AI', '  '],
      userId,
    });

    expect(tags.filter((row) => row.id.startsWith('created'))).toEqual([
      expect.objectContaining({
        brandId,
        category: TagCategory.ARTICLE,
        label: 'AI',
        organizationId,
        userId,
      }),
    ]);
    const createdId = tags.at(-1)?.id;
    expect(articles).toEqual([
      {
        brandId,
        data: {
          category: ArticleCategory.POST,
          content: '<p>Body</p>',
          // Stamped by the service so the recap and generation-result emails
          // can read a completion time off the article itself.
          generationCompletedAt: expect.any(String),
          label: 'Generated article',
          slug: 'generated-article',
          status: ArticleStatus.DRAFT,
          summary: 'Summary',
          tags: ['existing-tag-1', createdId],
        },
        organizationId,
        userId,
      },
    ]);
  });

  it('omits tags from the payload when generation returns none', async () => {
    await service.persistGeneratedArticle({
      brandId,
      category: ArticleCategory.X_ARTICLE,
      createArticleFn,
      draft: { ...draft, label: 'X Title' },
      organizationId,
      slug: 'x-title',
      userId,
    });

    expect(articles[0]?.data).toMatchObject({
      category: ArticleCategory.X_ARTICLE,
      status: ArticleStatus.DRAFT,
    });
    expect(articles[0]?.data).not.toHaveProperty('tags');
    expect(tags).toHaveLength(3);
  });

  it('still creates the article untagged when tag resolution fails', async () => {
    isTagStoreDown = true;

    await service.persistGeneratedArticle({
      brandId,
      category: ArticleCategory.POST,
      createArticleFn,
      draft,
      organizationId,
      slug: 'generated-article',
      tagLabels: ['AI'],
      userId,
    });

    expect(articles).toHaveLength(1);
    expect(articles[0]?.data.tags).toBeUndefined();
  });
});
