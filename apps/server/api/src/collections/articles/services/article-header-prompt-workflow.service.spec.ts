vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import type { ArticleDocument } from '@api/collections/articles/schemas/article.schema';
import {
  ARTICLE_HEADER_PROMPT_ACTION_IDS,
  ARTICLE_HEADER_PROMPT_WORKFLOW_DEFINITION,
} from '@api/collections/articles/services/article-header-prompt-workflow-definition';
import { ArticleRemixService } from '@api/collections/articles/services/article-remix.service';
import { ArticleVersionService } from '@api/collections/articles/services/article-version.service';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import type { SystemWorkflowActionExecutor } from '@api/collections/workflows/system-workflow-runner.service';

describe('article header prompt workflow registration', () => {
  const createService = () => {
    const actions = new Map<string, SystemWorkflowActionExecutor>();
    const articleInsights = { generateHeaderPrompt: vi.fn() };
    const registerAction = vi.fn(
      (id: string, executor: SystemWorkflowActionExecutor) => {
        actions.set(id, executor);
      },
    );
    const registerWorkflow = vi.fn();
    const runner = { registerAction, registerWorkflow };
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    const prisma = {
      _runtimeDataModel: {
        models: {
          Article: { fields: [{ name: 'id' }, { name: 'isDeleted' }] },
        },
      },
      article: {},
    };
    const service = new ArticlesService(
      prisma as never,
      logger as never,
      {} as never,
      new ArticleVersionService(logger as never),
      articleInsights as never,
      new ArticleRemixService(logger as never),
      undefined,
      undefined,
      {} as never,
      undefined,
      undefined,
      undefined,
      undefined,
      { get: vi.fn().mockReturnValue(runner) } as never,
    );

    service.onModuleInit();
    return {
      actions,
      articleInsights,
      registerAction,
      registerWorkflow,
      service,
    };
  };

  it('registers the three atomic actions and immutable graph', () => {
    const { registerAction, registerWorkflow } = createService();

    const registeredIds = registerAction.mock.calls.map(([id]) => id);
    expect(registeredIds).toEqual(
      expect.arrayContaining(Object.values(ARTICLE_HEADER_PROMPT_ACTION_IDS)),
    );
    expect(registerWorkflow).toHaveBeenCalledWith(
      ARTICLE_HEADER_PROMPT_WORKFLOW_DEFINITION,
    );
  });

  it('keeps generation and persistence as separate atomic actions', async () => {
    const { actions, articleInsights, service } = createService();
    const article = { id: 'article-1' } as ArticleDocument;
    articleInsights.generateHeaderPrompt.mockResolvedValue('Header prompt');
    const findOne = vi.spyOn(service, 'findOne').mockResolvedValue(article);
    const patch = vi.spyOn(service, 'patch').mockResolvedValue(article);

    const loaded = await actions.get(ARTICLE_HEADER_PROMPT_ACTION_IDS.LOAD)?.({
      context: { organizationId: 'org-1' } as never,
      input: { request: { articleId: article.id } },
      provenance: {} as never,
    });
    expect(findOne).toHaveBeenCalledWith({
      id: article.id,
      isDeleted: false,
      organizationId: 'org-1',
    });

    const generated = await actions.get(
      ARTICLE_HEADER_PROMPT_ACTION_IDS.GENERATE,
    )?.({
      context: { organizationId: 'org-1' } as never,
      input: { state: loaded },
      provenance: {} as never,
    });

    expect(articleInsights.generateHeaderPrompt).toHaveBeenCalledWith(
      article,
      'org-1',
    );
    expect(patch).not.toHaveBeenCalled();

    await actions.get(ARTICLE_HEADER_PROMPT_ACTION_IDS.PERSIST)?.({
      context: { organizationId: 'org-1' } as never,
      input: { state: { ...(generated as object), prompt: 'Header prompt' } },
      provenance: {} as never,
    });

    expect(patch).toHaveBeenCalledWith(article.id, {
      generationPrompt: 'Header prompt',
    });
  });
});
