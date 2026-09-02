import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

// See articles.service.cache.spec.ts — `@genfeedai/prisma` re-exports the
// generated client, which only exists after `prisma generate` and is heavy to
// load. canonicalPrismaMock() supplies the real schema-derived model metadata
// BaseService needs without importing the client.
vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import type { CreateArticleDto } from '@api/collections/articles/dto/create-article.dto';
import { ArticleInsightsService } from '@api/collections/articles/services/article-insights.service';
import { ArticleRemixService } from '@api/collections/articles/services/article-remix.service';
import { ArticleVersionService } from '@api/collections/articles/services/article-version.service';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { ARTICLE_CREATE_UNKNOWN_PRISMA_FIELDS } from '@api/helpers/utils/article-filter/article-filter.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ArticleCategory, ArticleStatus } from '@genfeedai/enums';
import { getModelMeta } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';

/**
 * Regression coverage for #2767. `articles` persisted `title`/`excerpt` while
 * every layer above Prisma — CreateArticleDto, the serializer attributes, the
 * JSON:API wire contract, packages/client — used `label`/`summary`. The
 * mismatch was invisible to TypeScript because ArticleDocument declared
 * `label?`/`summary?` as optional Mongo-era aliases (see
 * .agents/memory/rules/prisma_legacy_alias_fields.md): they type-check and are
 * undefined at runtime.
 *
 * `BaseService.normalizeData` only drops `undefined` keys — it does not filter
 * unknown ones — so the DTO's `label` reached `prisma.article.create` as an
 * unknown argument while the NOT NULL `title` column was never supplied.
 * API article creation failed outright, and the serializer emitted
 * `label: undefined`, rendering blank cards on genfeed.ai/articles.
 *
 * The guard below is deliberately schema-aware rather than snapshot-based:
 * every key the create path writes must be a real Article column according to
 * the committed, schema-generated `PRISMA_MODEL_METADATA`. That is the exact
 * invariant the bug violated, and it fails again the moment the DTO and the
 * schema drift apart in either direction.
 */
describe('ArticlesService create persistence', () => {
  const organizationId = 'org_1';
  const userId = 'user_1';
  const brandId = 'brand_1';

  function buildService() {
    const delegate = {
      create: vi.fn().mockResolvedValue({
        id: 'article_1',
        isDeleted: false,
        label: 'How to prompt images',
        organizationId,
        slug: 'how-to-prompt-images',
        summary: 'A practical guide.',
        userId,
      }),
    };

    const prisma = {
      article: delegate,
    } as unknown as PrismaService;

    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService;

    const configService = {
      get: vi.fn().mockReturnValue('https://genfeed.ai'),
    } as unknown as ConfigService;

    const service = new ArticlesService(
      prisma,
      logger,
      configService,
      new ArticleVersionService(logger),
      new ArticleInsightsService(logger, configService),
      new ArticleRemixService(logger),
    );

    return { delegate, service };
  }

  function readCreatedData(delegate: { create: ReturnType<typeof vi.fn> }) {
    const call = delegate.create.mock.calls.at(-1)?.[0] as
      | { data?: Record<string, unknown> }
      | undefined;
    return call?.data ?? {};
  }

  const dto = {
    content: '<p>Body</p>',
    label: 'How to prompt images',
    slug: 'how-to-prompt-images',
    status: ArticleStatus.PUBLISHED,
    summary: 'A practical guide.',
  } as CreateArticleDto;

  it('writes only keys that exist as Article columns', async () => {
    const { delegate, service } = buildService();

    await service.createArticle(dto, userId, organizationId, brandId);

    const columns = new Set(getModelMeta('Article')?.allFields ?? []);
    expect(columns.size).toBeGreaterThan(0);

    const unknownKeys = Object.keys(readCreatedData(delegate)).filter(
      (key) => !columns.has(key),
    );
    expect(unknownKeys).toEqual([]);
  });

  it('persists label and summary verbatim', async () => {
    const { delegate, service } = buildService();

    await service.createArticle(dto, userId, organizationId, brandId);

    const data = readCreatedData(delegate);
    expect(data.label).toBe('How to prompt images');
    expect(data.summary).toBe('A practical guide.');
    expect(data.slug).toBe('how-to-prompt-images');
    expect(data.content).toBe('<p>Body</p>');
  });

  it('never reintroduces the retired title/excerpt column names', async () => {
    const columns = new Set(getModelMeta('Article')?.allFields ?? []);

    expect(columns.has('label')).toBe(true);
    expect(columns.has('summary')).toBe(true);
    expect(columns.has('title')).toBe(false);
    expect(columns.has('excerpt')).toBe(false);
  });

  it('still normalizes status to the persisted Prisma label', async () => {
    const { delegate, service } = buildService();

    await service.createArticle(dto, userId, organizationId, brandId);

    expect(readCreatedData(delegate).status).toBe('PUBLISHED');
  });

  it('strips unknown generate fields and keeps label/summary/content (#2859)', async () => {
    const { delegate, service } = buildService();
    const generatePayload = {
      aiGeneration: {
        completedAt: new Date('2026-08-12T00:00:00.000Z'),
        prompt: 'Write about prompting',
        startedAt: new Date('2026-08-12T00:00:00.000Z'),
      },
      category: ArticleCategory.POST,
      content: '<p>Generated body</p>',
      label: 'Generated label',
      slug: 'generated-label',
      status: ArticleStatus.DRAFT,
      summary: 'Generated summary',
      xArticleMetadata: {
        estimatedReadTime: 1,
        sections: [],
        wordCount: 12,
      },
    };

    await service.createArticle(
      generatePayload as CreateArticleDto,
      userId,
      organizationId,
      brandId,
    );

    const data = readCreatedData(delegate);
    const columns = new Set(getModelMeta('Article')?.allFields ?? []);
    expect(columns.size).toBeGreaterThan(0);

    for (const key of ARTICLE_CREATE_UNKNOWN_PRISMA_FIELDS) {
      expect(columns.has(key)).toBe(false);
      expect(data[key]).toBeUndefined();
    }

    const unknownKeys = Object.keys(data).filter((key) => !columns.has(key));
    expect(unknownKeys).toEqual([]);
    expect(data.label).toBe('Generated label');
    expect(data.summary).toBe('Generated summary');
    expect(data.content).toBe('<p>Generated body</p>');
    expect(data.status).toBe('DRAFT');
  });

  it('converts tag ids into a nested relation connect write (#2870 follow-up)', async () => {
    const { delegate, service } = buildService();

    await service.createArticle(
      { ...dto, tags: ['tag_1', 'tag_2'] } as CreateArticleDto,
      userId,
      organizationId,
      brandId,
    );

    expect(readCreatedData(delegate).tags).toEqual({
      connect: [{ id: 'tag_1' }, { id: 'tag_2' }],
    });
  });

  it('omits the tags key entirely when the DTO has none', async () => {
    const { delegate, service } = buildService();

    await service.createArticle(dto, userId, organizationId, brandId);

    expect('tags' in readCreatedData(delegate)).toBe(false);
  });

  it('generate persist source never assigns unknown Prisma Article fields', () => {
    const source = readFileSync(
      fileURLToPath(
        new URL(
          '../../../../../server/src/collections/articles/services/articles-content.service.ts',
          import.meta.url,
        ),
      ),
      'utf8',
    );

    expect(source).not.toMatch(/\baiGeneration\s*:/);
    expect(source).not.toMatch(/\bxArticleMetadata\s*:/);
    expect(source).not.toMatch(/\bxArticleMetadata\s*,/);
  });
});
