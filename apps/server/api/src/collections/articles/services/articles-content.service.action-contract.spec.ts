import type { ArticleDocument } from '@api/collections/articles/schemas/article.schema';
import type { ArticleContentPersistenceService } from '@api/collections/articles/services/article-content-persistence.service';
import type { ArticleReviewService } from '@api/collections/articles/services/article-review.service';
import type { ArticleTextGenerationService } from '@api/collections/articles/services/article-text-generation.service';
import { ArticlesContentService } from '@api/collections/articles/services/articles-content.service';
import { readArticleGenerationInput } from '@api/collections/articles/utils/article-workflow-input.util';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { PersonasService } from '@api/collections/personas/services/personas.service';
import type { TemplatesService } from '@api/collections/templates/services/templates.service';
import { ContentHarnessService } from '@api/services/harness/harness.service';
import type { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { runtimeSettingsMock } from '@api-test/helpers/runtime-settings.mock';
import { getActionDefinition } from '@genfeedai/actions';
import { isRecord } from '@genfeedai/contracts/constants/type-guards.constant';
import { compileActionContract } from '@genfeedai/workflows/engine';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

const GENERATION_LOAD_ACTION_ID = 'article.generation.load-context';
const REVIEW_LOAD_ACTION_ID = 'article.review.load-context';
const PROVENANCE = {
  nodeId: 'load-context',
  runId: 'run_1',
  workflowId: 'article.generation',
  workflowVersionId: 'version_1',
};

function compileContract(actionId: string) {
  const action = getActionDefinition(actionId);
  if (!isRecord(action?.inputSchema) || !isRecord(action?.outputSchema)) {
    throw new Error(`${actionId} must have a contract`);
  }
  return compileActionContract(actionId, {
    inputSchema: action.inputSchema,
    outputSchema: action.outputSchema,
  });
}

/**
 * The load-context actions return the brand harness context, which the output
 * contract validates as a JSON document. This runs the real harness and the
 * real prompt-builder brand context for a brand with no description, colours
 * or persona (so those prompt fields are `undefined`) and validates the
 * result against the contract the workflow engine enforces
 * (API-GENFEED-AI-BF).
 */
describe('ArticlesContentService load-context action output', () => {
  const organizationId = 'org_1';
  const modelConfig = {
    generationModel: 'test-generation-model',
    reviewModel: 'test-review-model',
    updateModel: 'test-update-model',
  };

  function makeService(): ArticlesContentService {
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService;
    const configService = {
      get: vi.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;

    return new ArticlesContentService(
      runtimeSettingsMock(configService),
      logger,
      configService,
      {} as ArticleTextGenerationService,
      {} as ArticleReviewService,
      {} as ArticleContentPersistenceService,
      {
        getRenderedPrompt: vi.fn().mockResolvedValue('rendered prompt'),
        updateMetadata: vi.fn().mockResolvedValue(undefined),
      } as unknown as TemplatesService,
      {
        findOne: vi.fn().mockResolvedValue({ id: 'brand_1', label: 'Acme' }),
      } as unknown as BrandsService,
      {
        findOne: vi.fn().mockResolvedValue(null),
      } as unknown as PersonasService,
      new ContentHarnessService(configService, logger),
      undefined,
      undefined,
      {} as ReplicateService,
    );
  }

  it('returns a generation context the article.generation.load-context contract accepts', async () => {
    const context = await makeService().prepareGeneration(
      readArticleGenerationInput({
        dto: { count: 1, prompt: 'AI infrastructure trends' },
      }),
      'user_1',
      organizationId,
      'brand_1',
      modelConfig,
    );

    expect(() =>
      compileContract(GENERATION_LOAD_ACTION_ID).validateOutput(
        context,
        PROVENANCE,
      ),
    ).not.toThrow();
    expect(context.harnessContext.promptBuilder.brand).toEqual({
      label: 'Acme',
    });
  });

  it('returns a review context the article.review.load-context contract accepts', async () => {
    const context = await makeService().prepareExistingReview(
      {
        brandId: 'brand_1',
        content: 'Body',
        id: 'article_1',
        label: 'Title',
      } as ArticleDocument,
      organizationId,
      modelConfig,
    );

    expect(() =>
      compileContract(REVIEW_LOAD_ACTION_ID).validateOutput(
        context,
        PROVENANCE,
      ),
    ).not.toThrow();
  });
});
