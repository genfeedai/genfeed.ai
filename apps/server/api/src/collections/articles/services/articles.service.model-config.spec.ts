import { describe, expect, it, vi } from 'vitest';

// See articles.service.cache.spec.ts: `@genfeedai/prisma` re-exports the
// generated client, which only exists after `prisma generate` and is heavy to
// load in a unit test. canonicalPrismaMock() supplies the schema-derived
// metadata BaseService needs without importing the real client.
vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { ArticleInsightsService } from '@api/collections/articles/services/article-insights.service';
import { ArticleRemixService } from '@api/collections/articles/services/article-remix.service';
import { ArticleVersionService } from '@api/collections/articles/services/article-version.service';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import type { ArticlesContentService } from '@api/collections/articles/services/articles-content.service';
import type { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MODEL_KEYS } from '@genfeedai/constants';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import type { ModuleRef } from '@nestjs/core';

const ARTICLE_LOAD_GENERATION_ACTION_ID = 'article.generation.load-context';

type CapturedWorkflowAction = (request: {
  context: { organizationId: string; userId: string };
  input: Record<string, unknown>;
}) => Promise<unknown> | unknown;

/**
 * `GenerateArticlesDto.model` carries the agent's
 * `agentPolicy.generationModelOverride` into article generation. It has to win
 * over the org default for the generation step only — the review and update
 * steps keep their own configured models.
 */
describe('ArticlesService article cycle model config', () => {
  const organizationId = 'org_1';

  function buildService(
    settings: {
      defaultModel?: string;
      defaultModelReview?: string;
      defaultModelUpdate?: string;
    } | null,
    { hasSettingsService = true }: { hasSettingsService?: boolean } = {},
  ) {
    const prisma = {
      _runtimeDataModel: {
        models: {
          Article: {
            fields: [{ name: 'id' }, { name: 'isDeleted' }],
          },
        },
      },
      article: {},
    } as unknown as PrismaService;

    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService;

    const configService = {
      get: vi.fn(),
    } as unknown as ConfigService;

    const organizationSettingsService = {
      findOne: vi.fn().mockResolvedValue(settings),
    } as unknown as OrganizationSettingsService;

    const articlesContentService = {
      prepareGeneration: vi.fn().mockResolvedValue({}),
    } as unknown as ArticlesContentService;

    const actions = new Map<string, CapturedWorkflowAction>();
    const moduleRef = {
      get: vi.fn().mockReturnValue({
        registerAction: (id: string, action: CapturedWorkflowAction) => {
          actions.set(id, action);
        },
        registerWorkflow: vi.fn(),
      }),
    } as unknown as ModuleRef;

    const service = new ArticlesService(
      prisma,
      logger,
      configService,
      new ArticleVersionService(logger),
      new ArticleInsightsService(logger, configService),
      new ArticleRemixService(logger),
      undefined, // notificationsService
      hasSettingsService ? organizationSettingsService : undefined,
      articlesContentService,
      undefined, // cacheService
      undefined, // usersService
      undefined, // organizationsService
      undefined, // cacheInvalidationService
      moduleRef,
    );

    return {
      actions,
      articlesContentService,
      organizationSettingsService,
      service,
    };
  }

  it('prefers the per-request generation model over the org default', async () => {
    const { service } = buildService({
      defaultModel: MODEL_KEYS.REPLICATE_ANTHROPIC_CLAUDE_4_5_SONNET,
      defaultModelReview: MODEL_KEYS.REPLICATE_GOOGLE_GEMINI_2_5_FLASH,
      defaultModelUpdate: MODEL_KEYS.REPLICATE_GOOGLE_GEMINI_2_5_FLASH,
    });

    const config = await service.resolveArticleCycleModelConfig(
      organizationId,
      MODEL_KEYS.REPLICATE_GOOGLE_GEMINI_3_PRO,
    );

    expect(config).toEqual({
      generationModel: MODEL_KEYS.REPLICATE_GOOGLE_GEMINI_3_PRO,
      reviewModel: MODEL_KEYS.REPLICATE_GOOGLE_GEMINI_2_5_FLASH,
      updateModel: MODEL_KEYS.REPLICATE_GOOGLE_GEMINI_2_5_FLASH,
    });
  });

  it('falls back to the org default when no override is supplied', async () => {
    const { service } = buildService({
      defaultModel: MODEL_KEYS.REPLICATE_ANTHROPIC_CLAUDE_4_5_SONNET,
    });

    const config = await service.resolveArticleCycleModelConfig(organizationId);

    expect(config.generationModel).toBe(
      MODEL_KEYS.REPLICATE_ANTHROPIC_CLAUDE_4_5_SONNET,
    );
    expect(config.reviewModel).toBe(DEFAULT_MINI_TEXT_MODEL);
    expect(config.updateModel).toBe(DEFAULT_MINI_TEXT_MODEL);
  });

  it('falls back to the system default when the org has no settings', async () => {
    const { service } = buildService(null);

    const config = await service.resolveArticleCycleModelConfig(organizationId);

    expect(config.generationModel).toBe(DEFAULT_TEXT_MODEL);
  });

  it('applies the override when the org has no settings', async () => {
    const { service } = buildService(null);

    const config = await service.resolveArticleCycleModelConfig(
      organizationId,
      MODEL_KEYS.REPLICATE_GOOGLE_GEMINI_3_PRO,
    );

    expect(config.generationModel).toBe(
      MODEL_KEYS.REPLICATE_GOOGLE_GEMINI_3_PRO,
    );
  });

  it('applies the override when the settings service is unavailable', async () => {
    const { service } = buildService(null, { hasSettingsService: false });

    const config = await service.resolveArticleCycleModelConfig(
      organizationId,
      MODEL_KEYS.REPLICATE_GOOGLE_GEMINI_3_PRO,
    );

    expect(config).toEqual({
      generationModel: MODEL_KEYS.REPLICATE_GOOGLE_GEMINI_3_PRO,
      reviewModel: DEFAULT_MINI_TEXT_MODEL,
      updateModel: DEFAULT_MINI_TEXT_MODEL,
    });
  });

  it('hands the per-request model to the content service', async () => {
    const { actions, articlesContentService, service } = buildService({
      defaultModel: MODEL_KEYS.REPLICATE_ANTHROPIC_CLAUDE_4_5_SONNET,
    });

    // Generation is workflow-backed: the model override travels through the
    // load-context action, which resolves the cycle config before handing the
    // dto to the content service.
    service.onModuleInit();
    const loadContext = actions.get(ARTICLE_LOAD_GENERATION_ACTION_ID);
    expect(loadContext).toBeDefined();

    await loadContext?.({
      context: { organizationId, userId: 'user_1' },
      input: {
        brandId: 'brand_1',
        dto: {
          model: MODEL_KEYS.REPLICATE_GOOGLE_GEMINI_3_PRO,
          prompt: 'AI infrastructure trends',
        },
      },
    });

    expect(articlesContentService.prepareGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        model: MODEL_KEYS.REPLICATE_GOOGLE_GEMINI_3_PRO,
      }),
      'user_1',
      organizationId,
      'brand_1',
      expect.objectContaining({
        generationModel: MODEL_KEYS.REPLICATE_GOOGLE_GEMINI_3_PRO,
      }),
    );
  });
});
