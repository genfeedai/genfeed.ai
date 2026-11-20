import { delegateFindOneSelect } from '@api-test/mocks/service.mocks';
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

import { GenerateArticlesDto } from '@api/collections/articles/dto/generate-articles.dto';
import { ArticleInsightsService } from '@api/collections/articles/services/article-insights.service';
import { ArticleRemixService } from '@api/collections/articles/services/article-remix.service';
import { ArticleVersionService } from '@api/collections/articles/services/article-version.service';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import type { ArticlesContentService } from '@api/collections/articles/services/articles-content.service';
import type { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { getActionDefinition } from '@genfeedai/actions';
import { LLM_DEFAULTS, MODEL_KEYS } from '@genfeedai/contracts/constants';
import { isRecord } from '@genfeedai/contracts/constants/type-guards.constant';
import { compileActionContract } from '@genfeedai/workflows/engine';
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
    {
      hasSettingsService = true,
      agentChatModelRegistry,
      runWorkflow,
    }: {
      hasSettingsService?: boolean;
      runWorkflow?: (request: { inputValues: Record<string, unknown> }) => {
        result: unknown;
      };
      agentChatModelRegistry?: Pick<
        AgentChatModelRegistryService,
        'resolveModelKey'
      >;
    } = {},
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
      findOneSelect: delegateFindOneSelect(),
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
        runWorkflow,
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
      agentChatModelRegistry as AgentChatModelRegistryService | undefined,
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

    expect(config.generationModel).toBe(LLM_DEFAULTS.contentWriting);
  });

  it('uses the Admin default TEXT model over the seed fallback when no explicit or org model is set', async () => {
    const adminDefaultModel = MODEL_KEYS.REPLICATE_GOOGLE_GEMINI_3_PRO;
    const resolveModelKey = vi.fn().mockResolvedValue(adminDefaultModel);
    const { service } = buildService(null, {
      agentChatModelRegistry: { resolveModelKey },
    });

    const config = await service.resolveArticleCycleModelConfig(organizationId);

    expect(resolveModelKey).toHaveBeenCalledWith(
      undefined,
      LLM_DEFAULTS.contentWriting,
    );
    expect(config.generationModel).toBe(adminDefaultModel);
  });

  it('falls back to LLM_DEFAULTS.contentWriting when the registry resolves nothing new', async () => {
    const resolveModelKey = vi
      .fn()
      .mockImplementation(
        (_key: string | undefined, fallbackKey: string) => fallbackKey,
      );
    const { service } = buildService(null, {
      agentChatModelRegistry: { resolveModelKey },
    });

    const config = await service.resolveArticleCycleModelConfig(organizationId);

    expect(config.generationModel).toBe(LLM_DEFAULTS.contentWriting);
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

  it('passes a validated article request with omitted fields to the workflow', async () => {
    const action = getActionDefinition(ARTICLE_LOAD_GENERATION_ACTION_ID);
    if (!isRecord(action?.inputSchema) || !isRecord(action?.outputSchema)) {
      throw new Error('The article load-context action must have a contract');
    }
    const contract = compileActionContract(ARTICLE_LOAD_GENERATION_ACTION_ID, {
      inputSchema: action.inputSchema,
      outputSchema: action.outputSchema,
    });
    const expected = { articles: [{ id: 'draft_1' }], billedCredits: 0 };
    const { service } = buildService(null, {
      runWorkflow: ({ inputValues }) => {
        contract.validateInput(inputValues, {
          nodeId: 'load-context',
          runId: 'run_1',
          workflowId: 'article.generation',
          workflowVersionId: 'version_1',
        });
        expect(inputValues).toEqual({
          brandId: 'brand_1',
          dto: {
            count: 1,
            generateHeaderImage: false,
            keywords: ['AI'],
            prompt: 'AI infrastructure trends',
          },
        });
        return { result: expected };
      },
    });
    const dto = Object.assign(new GenerateArticlesDto(), {
      count: 1,
      generateHeaderImage: false,
      keywords: ['AI'],
      prompt: 'AI infrastructure trends',
      tone: undefined,
    });

    await expect(
      service.generateArticles(dto, 'user_1', organizationId, 'brand_1'),
    ).resolves.toEqual(expected);
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
