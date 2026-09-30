import { isDeepStrictEqual } from 'node:util';
import { VisualProjectWorkflowService } from '@api/collections/visual-projects/services/visual-project-workflow.service';
import { buildVisualProjectWorkflowDefinition } from '@api/collections/visual-projects/services/visual-project-workflow-definition';
import { buildHiddenSystemWorkflowMetadata } from '@api/collections/workflows/system-workflow.contract';
import type { SystemWorkflowActionExecutor } from '@api/collections/workflows/system-workflow-runner.service';
import { buildWorkflowVersionDefinition } from '@api/collections/workflows/workflow-version-definition';
import type { IVisualCodeReceipt } from '@genfeedai/contracts/interfaces';
import type { VisualRevision } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

function fixture() {
  const revision = {
    id: 'revision',
    projectId: 'project',
    organizationId: 'org',
    brandId: 'brand',
    userId: 'user',
    status: 'queued',
    prompt: 'Make a title',
    receipts: [
      {
        id: 'admission-initial',
        kind: 'admission',
        state: 'confirmed',
        credits: 0,
        operatorCredits: 0,
        boundCredits: 0,
        isResultApplied: true,
      },
    ],
    diagnostics: [],
    outputRequests: [{ format: 'png', frame: 0 }],
    settings: { width: 640, height: 360, fps: 30, durationFrames: 30 },
    props: {},
    sourceAssetIds: [],
    maximumCredits: 12,
    consumedCredits: 0,
    cancelRequestedAt: null,
  } as unknown as VisualRevision;
  let executor: SystemWorkflowActionExecutor | undefined;
  const workflow = {
    registerWorkflow: vi.fn(),
    registerAction: vi.fn((_id, handler) => {
      executor = handler;
    }),
  };
  let leaseOwner = 'owner';
  const prisma = {
    workflowNodeClaim: {
      findFirst: vi.fn(async (query) =>
        query.where.leaseOwnerId && query.where.leaseOwnerId !== leaseOwner
          ? null
          : { leaseOwnerId: leaseOwner },
      ),
    },
    workflow: {
      findFirstOrThrow: vi.fn(async () => ({
        metadata: {
          sourceType: 'hidden-system-workflow',
          systemWorkflow: buildHiddenSystemWorkflowMetadata({
            canonicalId: 'visual-code.execute',
          }),
        },
      })),
    },
    workflowExecution: {
      findFirstOrThrow: vi.fn(async () => ({
        workflowId: 'workflow',
        result: { metadata: { canonicalId: 'visual-code.execute' } },
        workflow: {
          metadata: {
            sourceType: 'hidden-system-workflow',
            systemWorkflow: buildHiddenSystemWorkflowMetadata({
              canonicalId: 'visual-code.execute',
            }),
          },
        },
        workflowVersion: {
          workflowId: 'workflow',
          contentHash: buildWorkflowVersionDefinition(
            buildVisualProjectWorkflowDefinition().definition,
          ).contentHash,
        },
      })),
    },
    visualRevision: {
      findFirstOrThrow: vi.fn(async () => structuredClone(revision)),
      updateMany: vi.fn(async ({ where, data }) => {
        if (where.cancelRequestedAt === null && revision.cancelRequestedAt)
          return { count: 0 };
        if (
          where.receipts &&
          !isDeepStrictEqual(where.receipts.equals, revision.receipts)
        )
          return { count: 0 };
        Object.assign(revision, structuredClone(data));
        return { count: 1 };
      }),
    },
  };
  const authoring = {
    authorParameters: vi.fn().mockResolvedValue({}),
    call: vi.fn().mockResolvedValue({
      model: 'openai/test',
      choices: [{ message: { content: '{not valid json' } }],
      usage: { prompt_tokens: 5, completion_tokens: 10, cost: 0.1 },
    }),
    parseSource: vi.fn(
      (response) => JSON.parse(response.choices[0].message.content).sourceCode,
    ),
  };
  const billing = {
    validateSnapshot: vi.fn().mockResolvedValue({
      modelKey: 'openai/test',
      provider: 'openai',
      isByok: false,
      authoringCredits: 9,
      maximumAuthoringCalls: 3,
      inspectionCredits: 3,
      maximumInspectionCalls: 3,
    }),
    actualCredits: vi.fn().mockResolvedValue(2),
    settle: vi.fn().mockResolvedValue(undefined),
  };
  const reconcileStopped = billing.settle;
  Object.assign(billing, { reconcileStopped });
  const renderer = { execute: vi.fn() };
  const service = new VisualProjectWorkflowService(
    prisma as never,
    workflow as never,
    { authorizeBrand: vi.fn().mockResolvedValue(undefined) } as never,
    authoring as never,
    billing as never,
    renderer as never,
    {} as never,
  );
  service.onModuleInit();
  const run = async () => {
    if (!executor) throw new Error('executor not registered');
    return executor({
      input: {
        job: {
          revisionId: 'revision',
          organizationId: 'org',
          brandId: 'brand',
          userId: 'user',
        },
      },
      context: {
        organizationId: 'org',
        userId: 'user',
        brandId: 'brand',
        executionId: 'execution',
        runId: 'execution',
      } as never,
      provenance: {
        executionId: 'execution',
        nodeId: 'execute',
        workflowId: 'workflow',
        workflowLabel: 'Visual',
      },
    });
  };
  return {
    run,
    service,
    revision,
    authoring,
    billing,
    renderer,
    prisma,
    loseLease: () => {
      leaseOwner = 'new-owner';
    },
  };
}
describe('visual workflow durable provider receipts', () => {
  it('charges a confirmed provider response even when its JSON cannot be parsed', async () => {
    const { run, revision, authoring, billing } = fixture();
    await run();
    expect(revision.status).toBe('failed');
    expect(revision.consumedCredits).toBe(2);
    expect(revision.receipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          state: 'confirmed',
          credits: 2,
          isResultApplied: false,
        }),
      ]),
    );
    expect(authoring.call).toHaveBeenCalledOnce();
    expect(billing.settle).toHaveBeenCalledWith(
      expect.objectContaining({ consumedCredits: 2 }),
      expect.any(Function),
    );
  });
  it('records consumed work after cancellation during a pending provider call and stops later stages', async () => {
    const { run, revision, authoring, renderer } = fixture();
    authoring.call.mockImplementationOnce(async () => {
      revision.cancelRequestedAt = new Date();
      return {
        model: 'openai/test',
        choices: [{ message: { content: '{"sourceCode":"source"}' } }],
        usage: { prompt_tokens: 5, completion_tokens: 10, cost: 0.1 },
      };
    });
    await run();
    expect(revision.status).toBe('cancelled');
    expect(revision.consumedCredits).toBe(2);
    expect(authoring.parseSource).not.toHaveBeenCalled();
    expect(renderer.execute).not.toHaveBeenCalled();
  });
  it('does not repeat a crash-started provider call and records uncertain operator liability', async () => {
    const { run, revision, authoring } = fixture();
    revision.receipts = [
      {
        id: 'author-0',
        kind: 'authoring',
        state: 'started',
        boundCredits: 3,
        credits: 0,
        operatorCredits: 0,
        isResultApplied: false,
      },
    ] as never;
    await run();
    expect(authoring.call).not.toHaveBeenCalled();
    expect(revision.consumedCredits).toBe(0);
    expect(revision.diagnostics).toContain('provider_call_indeterminate');
    expect(
      (revision.receipts as unknown as IVisualCodeReceipt[])[0].operatorCredits,
    ).toBe(3);
  });
  it('does not redispatch a confirmed but unapplied provider result after a crash', async () => {
    const { run, revision, authoring } = fixture();
    revision.receipts = [
      {
        id: 'author-0',
        kind: 'authoring',
        state: 'confirmed',
        boundCredits: 3,
        credits: 2,
        operatorCredits: 0,
        isResultApplied: false,
      },
    ] as never;
    revision.consumedCredits = 2;
    await run();
    expect(authoring.call).not.toHaveBeenCalled();
    expect(revision.diagnostics).toContain('provider_result_unavailable');
    expect(revision.consumedCredits).toBe(2);
  });
  it('a provider response after lease loss cannot overwrite receipts or settle the reclaimed execution', async () => {
    const { run, revision, authoring, billing, loseLease } = fixture();
    authoring.call.mockImplementationOnce(async () => {
      loseLease();
      return {
        model: 'openai/test',
        choices: [],
        usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.1 },
      };
    });
    await expect(run()).rejects.toThrow('Workflow node claim lease lost');
    expect(revision.status).toBe('authoring');
    expect(
      (revision.receipts as unknown as IVisualCodeReceipt[]).find(
        (entry) => entry.id === 'author-0',
      )?.state,
    ).toBe('started');
    expect(billing.settle).not.toHaveBeenCalled();
  });
});
