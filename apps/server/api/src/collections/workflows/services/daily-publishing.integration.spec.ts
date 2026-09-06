import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { TrendsService } from '@api/collections/trends/services/trends.service';
import { DailyPublishingService } from '@api/collections/workflows/services/daily-publishing.service';
import { WorkflowEngineConverterService } from '@api/collections/workflows/services/workflow-engine-converter.service';
import {
  executeAwaitedForEach,
  parseForEachOptions,
} from '@api/collections/workflows/system-workflow-for-each.util';
import {
  type SystemWorkflowActionExecutor,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import {
  DAILY_PUBLISHING_TEMPLATE,
  dailyPublishingAccountDefinition,
} from '@api/collections/workflows/templates/daily-publishing-workflow.template';
import { ContentQualityScorerService } from '@api/services/content-quality/content-quality-scorer.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  buildActionExecutionInput,
  WorkflowEngine,
} from '@genfeedai/workflows/engine';
import type { ModuleRef } from '@nestjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown> & { id: string };
type Query = { where: Record<string, unknown> };

function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      const filter = expected as Record<string, unknown>;
      if ('in' in filter) return (filter.in as unknown[]).includes(row[key]);
      if ('gte' in filter)
        return (
          new Date(String(row[key])).getTime() >=
          new Date(String(filter.gte)).getTime()
        );
      if ('not' in filter) return row[key] !== filter.not;
    }
    return row[key] === expected;
  });
}

function harness() {
  const rows: Row[] = [];
  const accounts: Row[] = [
    {
      id: 'account-x',
      platform: 'TWITTER',
      externalHandle: 'founder',
      organizationId: 'org',
      brandId: 'brand',
      isDeleted: false,
      isConnected: true,
    },
    {
      id: 'account-linkedin',
      platform: 'LINKEDIN',
      externalHandle: 'company',
      organizationId: 'org',
      brandId: 'brand',
      isDeleted: false,
      isConnected: true,
    },
  ];
  const findPost = ({ where }: Query) =>
    rows.find((row) => matches(row, where)) ?? null;
  const prisma = {
    $transaction: vi.fn(),
    brand: {
      findFirst: vi.fn(async ({ where }: Query) =>
        where.id === 'brand' && where.organizationId === 'org'
          ? { id: 'brand' }
          : null,
      ),
    },
    credential: {
      findFirst: vi.fn(
        async ({ where }: Query) =>
          accounts.find((row) => matches(row, where)) ?? null,
      ),
      findMany: vi.fn(async ({ where }: Query) =>
        accounts.filter((row) => matches(row, where)),
      ),
    },
    post: {
      findFirst: vi.fn(async (query: Query) => findPost(query)),
      findFirstOrThrow: vi.fn(async (query: Query) => {
        const post = findPost(query);
        if (!post) throw new Error('Post not found');
        return post;
      }),
      findMany: vi.fn(async ({ where }: Query) =>
        rows.filter((row) => matches(row, where)),
      ),
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => {
        const existing = rows.find(
          (row) =>
            row.organizationId === create.organizationId &&
            row.targetIdempotencyKey === create.targetIdempotencyKey,
        );
        if (existing) return existing;
        const row = {
          ...create,
          id: `post-${rows.length + 1}`,
          createdAt: new Date(),
          isDeleted: false,
        };
        rows.push(row);
        return row;
      }),
      updateMany: vi.fn(
        async ({ where, data }: Query & { data: Record<string, unknown> }) => {
          const selected = rows.filter((row) => matches(row, where));
          selected.forEach((row) => {
            Object.assign(row, data);
          });
          return { count: selected.length };
        },
      ),
    },
    postAnalytics: { findMany: vi.fn(async () => []) },
  };
  prisma.$transaction.mockImplementation(
    async (
      execute: (transaction: {
        post: typeof prisma.post;
        $queryRaw: ReturnType<typeof vi.fn>;
      }) => Promise<unknown>,
    ) =>
      execute({ post: prisma.post, $queryRaw: vi.fn().mockResolvedValue([]) }),
  );
  const bodies = [
    'Start with the customer question your team keeps answering. That is the useful idea to publish today.',
    'We turned support notes into a weekly editorial meeting. Our rule: each draft must explain one decision readers can make.',
    'Your last product mistake can teach more than a launch announcement. Explain what you changed and why.',
    'A practical research habit: record the evidence behind a recommendation before writing its headline. Readers deserve the reasoning.',
  ];
  let generatedCount = 0;
  const generator = {
    generateContentWorkflow: vi.fn(async () => [
      { content: bodies[generatedCount++] },
    ]),
  };
  const trends = { refreshTrends: vi.fn(async () => []) };
  const scorer = {
    scoreContent: vi.fn(async () => ({
      score: 9,
      feedback: ['Useful and supported'],
      suggestions: [],
    })),
  };
  const posts = {
    batchSchedule: vi.fn(
      async (
        items: Array<{ postId: string }>,
        organizationId: string,
        target: { credentialId: string; platform: string },
      ) => {
        const selected = rows.filter(
          (row) =>
            items.some((item) => item.postId === row.id) &&
            row.organizationId === organizationId &&
            row.credentialId === target.credentialId,
        );
        selected.forEach((row) => {
          row.targetExecutionState = 'scheduled';
        });
        return { missingPostIds: [], posts: selected };
      },
    ),
  };
  const actions = new Map<string, SystemWorkflowActionExecutor>();
  const runner = {
    registerWorkflow: vi.fn(),
    registerAction: (id: string, action: SystemWorkflowActionExecutor) =>
      actions.set(id, action),
  };
  const providers = new Map<unknown, unknown>([
    [SystemWorkflowRunnerService, runner],
    [ContentGeneratorService, generator],
    [TrendsService, trends],
    [ContentQualityScorerService, scorer],
    [PostsService, posts],
  ]);
  new DailyPublishingService(
    prisma as unknown as PrismaService,
    { get: (token: unknown) => providers.get(token) } as ModuleRef,
  ).onModuleInit();
  const converter = new WorkflowEngineConverterService();
  const accountDefinition = dailyPublishingAccountDefinition();

  const runGraph = async (
    kind: 'parent' | 'child',
    values: Record<string, unknown>,
    executionId: string,
  ) => {
    const definition =
      kind === 'parent'
        ? DAILY_PUBLISHING_TEMPLATE
        : accountDefinition.definition;
    const document = {
      ...definition,
      inputVariables: definition.inputVariables?.map((variable) => ({
        ...variable,
        required: variable.required ?? false,
      })),
      id:
        kind === 'parent'
          ? DAILY_PUBLISHING_TEMPLATE.id
          : accountDefinition.canonicalId,
      versionId: 'version',
      brandId: 'brand',
      organizationId: 'org',
      userId: 'user',
    };
    const executable = converter.applyRuntimeInputValues(
      document,
      converter.convertToExecutableWorkflow(document),
      values,
    );
    const engine = new WorkflowEngine({ maxConcurrency: 1 });
    for (const [id, action] of actions) {
      engine.registerExecutor(id, async (node, inputs, context) =>
        action({
          input: buildActionExecutionInput(node.config, inputs),
          context,
          provenance: {
            executionId,
            nodeId: node.id,
            workflowId: document.id,
            workflowLabel: 'Daily',
          },
        }),
      );
    }
    engine.registerExecutor(
      'workflow.for-each',
      async (node, inputs, context) => {
        const options = parseForEachOptions(
          buildActionExecutionInput(node.config, inputs),
        );
        return executeAwaitedForEach({
          ...options,
          childContexts: options.items.map(() => ({
            organizationId: context.organizationId,
            userId: context.userId,
          })),
          executeItem: async (index) => {
            const childId = `${executionId}:account:${index}`;
            const child = await runGraph(
              'child',
              { [options.itemInputKey]: options.items[index] },
              childId,
            );
            if (child.status !== 'completed')
              throw new Error(
                child.error ?? JSON.stringify([...child.nodeResults.values()]),
              );
            return {
              provenance: {
                executionId: childId,
                workflowId: options.childWorkflowId,
                workflowLabel: 'Daily account',
              },
              result: child.nodeResults.get('schedule')?.output,
            };
          },
        });
      },
    );
    return engine.execute(executable, { executionId, maxRetries: 0 });
  };
  return {
    rows,
    prisma,
    posts,
    generator,
    trends,
    scorer,
    run: (executionId: string, inputs: Record<string, unknown> = {}) =>
      runGraph(
        'parent',
        {
          brandId: 'brand',
          topics: ['Content research', 'Product lessons'],
          timezone: 'Europe/Malta',
          autoPublish: true,
          ...inputs,
        },
        executionId,
      ),
  };
}

function expectCompleted(
  result: Awaited<ReturnType<ReturnType<typeof harness>['run']>>,
) {
  expect(result.status, JSON.stringify([...result.nodeResults.values()])).toBe(
    'completed',
  );
}

afterEach(() => vi.useRealTimers());
describe('daily publishing executable graph', () => {
  it('runs two account slots once per day across retries and tomorrow’s recurrence', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-06T08:00:00Z'));
    const fixture = harness();
    expectCompleted(await fixture.run('first'));
    expect(fixture.posts.batchSchedule).toHaveBeenCalledTimes(2);
    expect(fixture.rows).toHaveLength(2);
    expect(
      fixture.rows.every((row) => row.targetExecutionState === 'scheduled'),
    ).toBe(true);
    expect(new Set(fixture.rows.map((row) => row.description)).size).toBe(2);
    expect(fixture.generator.generateContentWorkflow.mock.calls).toHaveLength(
      2,
    );
    expectCompleted(await fixture.run('same-day-rerun'));
    expect(fixture.posts.batchSchedule).toHaveBeenCalledTimes(2);
    vi.setSystemTime(new Date('2026-09-07T08:00:00Z'));
    expectCompleted(await fixture.run('tomorrow'));
    expect(fixture.rows).toHaveLength(4);
    expect(fixture.posts.batchSchedule).toHaveBeenCalledTimes(4);
    expect(
      new Set(fixture.rows.map((row) => row.targetIdempotencyKey)).size,
    ).toBe(4);
    expect(
      fixture.rows.every((row) => row.sourceActionId && row.promptUsed),
    ).toBe(true);
  });

  it('holds low quality output for review without scheduling it', async () => {
    const fixture = harness();
    fixture.scorer.scoreContent.mockResolvedValue({
      score: 5,
      feedback: ['Unsupported claim'],
      suggestions: [],
    });
    expectCompleted(await fixture.run('held'));
    expect(fixture.scorer.scoreContent).toHaveBeenCalledTimes(2);
    expect(
      fixture.rows.every(
        (row) =>
          typeof row.description === 'string' && row.description.length > 0,
      ),
    ).toBe(true);
    expect(fixture.posts.batchSchedule).not.toHaveBeenCalled();
    expect(fixture.rows).toHaveLength(2);
    expect(
      fixture.rows.every((row) => row.targetExecutionState === 'draft'),
    ).toBe(true);
  });

  it('preserves other account slots when one generation fails', async () => {
    const fixture = harness();
    fixture.generator.generateContentWorkflow.mockRejectedValueOnce(
      new Error('Generation unavailable'),
    );
    expectCompleted(await fixture.run('partial'));
    expect(fixture.posts.batchSchedule).toHaveBeenCalledTimes(1);
    expect(fixture.rows.some((row) => row.targetError)).toBe(true);
  });
});
