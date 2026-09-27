vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import {
  ArticleGenerationType,
  type GenerateArticlesDto,
} from '@api/collections/articles/dto/generate-articles.dto';
import type { ArticleDocument } from '@api/collections/articles/schemas/article.schema';
import { ArticleRemixService } from '@api/collections/articles/services/article-remix.service';
import { ArticleVersionService } from '@api/collections/articles/services/article-version.service';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { WORKFLOW_EXECUTOR } from '@api/collections/workflows/workflows.tokens';
import type { TextByokDispatch } from '@api/services/byok/text-dispatch-byok.util';
import { ByokProvider, WorkflowExecutionStatus } from '@genfeedai/contracts';
import type { NodeExecutor } from '@genfeedai/workflows/engine';

const ORG_KEY = 'org-owned-byok-key-5380';
const BYOK: TextByokDispatch = { keys: { [ByokProvider.OPENROUTER]: ORG_KEY } };

type GraphNode = {
  data?: { config?: { actionId?: string }; inputVariableKeys?: string[] };
  id: string;
};
type GraphEdge = {
  source: string;
  sourceHandle?: string;
  target: string;
  targetHandle?: string;
};
type PersistedExecution = {
  inputValues: Record<string, unknown>;
  metadata: Record<string, unknown>;
  nodeResults: Array<{ nodeId: string; output: unknown }>;
};

function readHandle(source: unknown, handle?: string): unknown {
  return handle && source && typeof source === 'object'
    ? (source as Record<string, unknown>)[handle]
    : source;
}

/**
 * Real SystemWorkflowRunnerService over a minimal graph engine. The engine
 * records everything a WorkflowExecution row persists — inputValues,
 * metadata and every node output — for every parent and child execution.
 */
function createHarness() {
  const executors = new Map<string, NodeExecutor>();
  const persisted: PersistedExecution[] = [];
  let runner: SystemWorkflowRunnerService;

  const executeManualWorkflowDocument = async (
    workflow: { id: string },
    userId: string,
    organizationId: string,
    inputValues: Record<string, unknown>,
    metadata: Record<string, unknown>,
  ) => {
    const graph = runner.getWorkflow(workflow.id);
    if (!graph) throw new Error(`No graph for ${workflow.id}`);
    const nodes = graph.definition.nodes as unknown as GraphNode[];
    const edges = graph.definition.edges as unknown as GraphEdge[];
    const outputs = new Map<string, unknown>();
    const execution: PersistedExecution = {
      inputValues,
      metadata,
      nodeResults: [],
    };
    const executionId = `execution-${persisted.length + 1}`;
    persisted.push(execution);

    for (const node of nodes) {
      const actionId = node.data?.config?.actionId ?? '';
      const inputs = new Map<string, unknown>();
      for (const key of node.data?.inputVariableKeys ?? []) {
        inputs.set(key, inputValues[key]);
      }
      for (const edge of edges.filter(({ target }) => target === node.id)) {
        inputs.set(
          edge.targetHandle ?? edge.source,
          readHandle(outputs.get(edge.source), edge.sourceHandle),
        );
      }
      const executor = executors.get(actionId);
      if (!executor) throw new Error(`No executor for ${actionId}`);
      const output = await executor(
        {
          config: node.data?.config ?? {},
          id: node.id,
          inputs: [...inputs.keys()],
          label: node.id,
          type: 'genfeedAction',
        },
        inputs,
        {
          executionId,
          organizationId,
          runId: executionId,
          userId,
          workflowId: workflow.id,
          workflowVersionId: `${workflow.id}-version`,
        },
      );
      outputs.set(node.id, output);
      execution.nodeResults.push({ nodeId: node.id, output });
    }

    return {
      executionId,
      nodeResults: execution.nodeResults,
      status: WorkflowExecutionStatus.COMPLETED,
    };
  };

  const adapter = {
    getRegisteredActionIds: () => [...executors.keys()],
    registerExecutor: (actionId: string, executor: NodeExecutor) => {
      executors.set(actionId, executor);
    },
  };
  runner = new SystemWorkflowRunnerService(
    {} as never,
    {
      get: (token: unknown) =>
        token === WORKFLOW_EXECUTOR
          ? { executeManualWorkflowDocument }
          : adapter,
    } as never,
  );
  const internals = runner as unknown as {
    ensureHiddenSystemWorkflowMirror: (definition: {
      canonicalId: string;
      label: string;
    }) => Promise<unknown>;
  };
  vi.spyOn(internals, 'ensureHiddenSystemWorkflowMirror').mockImplementation(
    async (definition) => ({
      currentVersion: { id: `${definition.canonicalId}-version` },
      id: definition.canonicalId,
      label: definition.label,
    }),
  );
  runner.onModuleInit();

  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const article = { id: 'article-1' } as ArticleDocument;
  const articleInsights = {
    generateHeaderPrompt: vi.fn().mockResolvedValue('Header prompt'),
  };
  const content = {
    generateDrafts: vi.fn(async (context: object) => ({
      billedCredits: 1,
      context,
      items: [{ context, draft: { slug: 'draft' } }],
    })),
    persistDraft: vi.fn(async () => ({ article, billedCredits: 3 })),
    prepareExistingReview: vi.fn(async () => ({ article })),
    prepareGeneration: vi.fn(async (dto: GenerateArticlesDto) => ({
      generateDto: dto,
      generationType: dto.type,
    })),
    reviewDraft: vi.fn(async (item: object) => ({
      ...item,
      billedCredits: 1,
      review: { score: 8 },
    })),
    reviewExistingPrepared: vi.fn(async () => ({
      billedCredits: 1,
      review: { score: 9 },
    })),
    reviseDraft: vi.fn(async (state: object) => ({
      ...state,
      updated: { content: 'revised' },
    })),
  };
  const prisma = {
    _runtimeDataModel: {
      models: { Article: { fields: [{ name: 'id' }, { name: 'isDeleted' }] } },
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
    content as never,
    undefined,
    undefined,
    undefined,
    undefined,
    { get: () => runner } as never,
  );
  service.onModuleInit();
  vi.spyOn(service, 'findOne').mockResolvedValue(article);
  vi.spyOn(service, 'patch').mockResolvedValue(article);

  return { article, articleInsights, content, logger, persisted, service };
}

const X_ARTICLE_DTO = {
  generateHeaderImage: true,
  prompt: 'Why BYOK matters',
  type: ArticleGenerationType.X_ARTICLE,
} as GenerateArticlesDto;

describe('article workflows carry BYOK keys outside persisted state (#5380)', () => {
  it('delivers the key to every text step of generation without persisting it', async () => {
    const { article, articleInsights, content, logger, persisted, service } =
      createHarness();

    const result = await service.generateArticles(
      X_ARTICLE_DTO,
      'user-1',
      'org-1',
      'brand-1',
      BYOK,
    );

    expect(result.articles).toHaveLength(1);
    expect(content.generateDrafts).toHaveBeenCalledWith(
      expect.anything(),
      BYOK,
    );
    expect(content.reviewDraft).toHaveBeenCalledWith(expect.anything(), BYOK);
    expect(content.reviseDraft).toHaveBeenCalledWith(expect.anything(), BYOK);
    expect(articleInsights.generateHeaderPrompt).toHaveBeenCalledWith(
      article,
      'org-1',
      BYOK,
    );
    // Parent generation, one draft child, one header-prompt child.
    expect(persisted).toHaveLength(3);
    expect(JSON.stringify(persisted)).not.toContain(ORG_KEY);
    expect(JSON.stringify(Object.values(logger))).not.toContain(ORG_KEY);
  });

  it('delivers the key to the review step without persisting it', async () => {
    const { content, persisted, service } = createHarness();

    await service.reviewArticle('article-1', 'user-1', 'org-1', 'hooks', BYOK);

    expect(content.reviewExistingPrepared).toHaveBeenCalledWith(
      expect.anything(),
      BYOK,
    );
    expect(persisted).toHaveLength(1);
    expect(JSON.stringify(persisted)).not.toContain(ORG_KEY);
  });

  it('delivers the key to the header prompt without persisting it', async () => {
    const { article, articleInsights, persisted, service } = createHarness();

    await service.generateHeaderPrompt('article-1', 'user-1', 'org-1', BYOK);

    expect(articleInsights.generateHeaderPrompt).toHaveBeenCalledWith(
      article,
      'org-1',
      BYOK,
    );
    expect(persisted).toHaveLength(1);
    expect(JSON.stringify(persisted)).not.toContain(ORG_KEY);
  });

  it('dispatches on the platform key when the request was charged credits', async () => {
    const { articleInsights, content, service } = createHarness();

    await service.generateArticles(X_ARTICLE_DTO, 'user-1', 'org-1', 'brand-1');

    expect(content.generateDrafts).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
    );
    expect(articleInsights.generateHeaderPrompt).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      undefined,
    );
  });
});
