import { isDeepStrictEqual } from 'node:util';
import { VisualProjectWorkflowService } from '@api/collections/visual-projects/services/visual-project-workflow.service';
import {
  buildVisualProjectFailureWorkflowDefinition,
  buildVisualProjectWorkflowDefinition,
} from '@api/collections/visual-projects/services/visual-project-workflow-definition';
import { buildHiddenSystemWorkflowMetadata } from '@api/collections/workflows/system-workflow.contract';
import type {
  SystemWorkflowActionExecutor,
  SystemWorkflowTerminalFailureHandler,
} from '@api/collections/workflows/system-workflow-runner.service';
import { buildWorkflowVersionDefinition } from '@api/collections/workflows/workflow-version-definition';
import type { IVisualCodeReceipt } from '@genfeedai/contracts/interfaces';
import type { VisualRevision } from '@genfeedai/prisma';
import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
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
    registerTerminalFailure: vi.fn(),
    registerWorkflow: vi.fn(),
    registerAction: vi.fn((_id, handler) => {
      if (_id === 'visual-code.execute-internal') executor = handler;
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
        if (where.status?.notIn?.includes(revision.status)) return { count: 0 };
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
      creditsPerSecond: 0,
    }),
    actualCredits: vi.fn().mockResolvedValue(2),
    settle: vi.fn().mockResolvedValue(undefined),
  };
  const reconcileStopped = billing.settle;
  Object.assign(billing, { reconcileStopped });
  const renderer = { execute: vi.fn() };
  const assets = { stage: vi.fn().mockResolvedValue([]) };
  const moduleAccess = { assertAccess: vi.fn().mockResolvedValue(undefined) };
  const service = new VisualProjectWorkflowService(
    prisma as never,
    workflow as never,
    { authorizeBrand: vi.fn().mockResolvedValue(undefined) } as never,
    authoring as never,
    billing as never,
    renderer as never,
    assets as never,
    moduleAccess as never,
    { reconcileFailedExecution: vi.fn() } as never,
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
    assets,
    moduleAccess,
    loseLease: () => {
      leaseOwner = 'new-owner';
    },
  };
}
describe('visual workflow durable provider receipts', () => {
  it.each([
    new ForbiddenException('Motion disabled'),
    new ServiceUnavailableException('Module settings unavailable'),
  ])(
    'settles owned work with no paid call when Motion admission fails: %s',
    async (error) => {
      const {
        run,
        revision,
        authoring,
        billing,
        renderer,
        assets,
        moduleAccess,
      } = fixture();
      moduleAccess.assertAccess.mockRejectedValue(error);
      expect(await run()).toMatchObject({ status: 'failed' });
      expect(moduleAccess.assertAccess).toHaveBeenCalledWith('org', 'motion');
      expect(authoring.call).not.toHaveBeenCalled();
      expect(renderer.execute).not.toHaveBeenCalled();
      expect(assets.stage).not.toHaveBeenCalled();
      expect(revision.receipts).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ state: 'started' })]),
      );
      expect(billing.settle).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed', consumedCredits: 0 }),
        expect.any(Function),
      );
    },
  );
  it('rechecks Motion after asynchronous author preparation before a started receipt or provider call', async () => {
    const { run, revision, authoring, billing, moduleAccess } = fixture();
    authoring.authorParameters.mockImplementationOnce(async () => {
      moduleAccess.assertAccess.mockRejectedValue(
        new ForbiddenException('Motion disabled'),
      );
      return {};
    });
    expect(await run()).toMatchObject({ status: 'failed' });
    expect(authoring.call).not.toHaveBeenCalled();
    expect(revision.receipts).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ state: 'started' })]),
    );
    expect(billing.settle).toHaveBeenCalledWith(
      expect.objectContaining({ consumedCredits: 0 }),
      expect.any(Function),
    );
  });
  it('rechecks Motion after asynchronous media staging before a render receipt or submission', async () => {
    const { run, revision, renderer, billing, assets, moduleAccess } =
      fixture();
    revision.prompt = null;
    revision.sourceCode = 'export const VisualComposition=()=>null;';
    revision.sourceHash = 'source-hash';
    assets.stage.mockImplementationOnce(async () => {
      moduleAccess.assertAccess.mockRejectedValue(
        new ForbiddenException('Motion disabled'),
      );
      return [];
    });
    expect(await run()).toMatchObject({ status: 'failed' });
    expect(renderer.execute).not.toHaveBeenCalled();
    expect(revision.receipts).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ state: 'started' })]),
    );
    expect(billing.settle).toHaveBeenCalledWith(
      expect.objectContaining({ consumedCredits: 0 }),
      expect.any(Function),
    );
  });
  it('reconciles an already terminal revision without a new-work module grant', async () => {
    const { run, revision, renderer, billing, moduleAccess } = fixture();
    revision.status = 'completed';
    moduleAccess.assertAccess.mockRejectedValue(
      new ForbiddenException('Motion disabled'),
    );
    expect(await run()).toMatchObject({ status: 'completed' });
    expect(moduleAccess.assertAccess).not.toHaveBeenCalled();
    expect(renderer.execute).not.toHaveBeenCalled();
    expect(billing.settle).toHaveBeenCalledOnce();
  });
  it('cancels between provider activity check and admission CAS without a paid call', async () => {
    const { run, revision, authoring, billing, renderer } = fixture();
    authoring.authorParameters.mockImplementationOnce(async () => {
      revision.cancelRequestedAt = new Date();
      return {};
    });
    expect(await run()).toMatchObject({ status: 'cancelled' });
    expect(authoring.call).not.toHaveBeenCalled();
    expect(renderer.execute).not.toHaveBeenCalled();
    expect(revision.receipts).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ state: 'started' })]),
    );
    expect(billing.settle).toHaveBeenCalledOnce();
    expect(billing.settle).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled', consumedCredits: 0 }),
      expect.any(Function),
    );
  });
  it('cancels between render activity check and admission CAS without submitting a render', async () => {
    const { run, revision, authoring, billing, renderer } = fixture();
    revision.prompt = null;
    revision.sourceCode = 'export const VisualComposition=()=>null;';
    revision.sourceHash = 'source-hash';
    const quote = await billing.validateSnapshot();
    billing.validateSnapshot.mockClear();
    billing.validateSnapshot.mockImplementationOnce(async () => {
      revision.cancelRequestedAt = new Date();
      return quote;
    });
    expect(await run()).toMatchObject({ status: 'cancelled' });
    expect(renderer.execute).not.toHaveBeenCalled();
    expect(authoring.call).not.toHaveBeenCalled();
    expect(billing.settle).toHaveBeenCalledOnce();
    expect(billing.settle).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled', consumedCredits: 0 }),
      expect.any(Function),
    );
  });
  it('fails and reconciles an owned admission contention instead of returning success with live work', async () => {
    const { run, revision, authoring, billing, prisma } = fixture();
    const update = prisma.visualRevision.updateMany.getMockImplementation();
    prisma.visualRevision.updateMany.mockImplementation(async (query) => {
      if (query.where.cancelRequestedAt === null) return { count: 0 };
      if (!update) throw new Error('update fixture missing');
      return update(query);
    });
    expect(await run()).toMatchObject({ status: 'failed' });
    expect(revision.diagnostics).toContain('visual_execution_busy');
    expect(authoring.call).not.toHaveBeenCalled();
    expect(billing.settle).toHaveBeenCalledOnce();
  });
  it('preserves a terminal status observed after an admission race and reconciles it', async () => {
    const { run, revision, authoring, billing } = fixture();
    authoring.authorParameters.mockImplementationOnce(async () => {
      revision.status = 'completed';
      return {};
    });
    expect(await run()).toMatchObject({ status: 'completed' });
    expect(authoring.call).not.toHaveBeenCalled();
    expect(billing.settle).toHaveBeenCalledOnce();
  });
  it('does not spend a repair call on invalid trusted renderer output without a result', async () => {
    const { run, revision, authoring, renderer, billing } = fixture();
    revision.sourceCode = 'export const VisualComposition=()=>null;';
    revision.sourceHash = 'source-hash';
    revision.receipts = [
      {
        id: 'author-0',
        kind: 'authoring',
        state: 'confirmed',
        boundCredits: 0,
        credits: 0,
        operatorCredits: 0,
        isResultApplied: true,
      },
    ];
    renderer.execute.mockResolvedValue({
      receipt: {
        status: 'failed',
        computeSeconds: 0,
        diagnostic: 'renderer_output_invalid',
      },
    });
    expect(await run()).toMatchObject({ status: 'failed' });
    expect(renderer.execute).toHaveBeenCalledOnce();
    expect(authoring.call).not.toHaveBeenCalled();
    expect(revision.diagnostics).toContain('renderer_output_invalid');
    expect(billing.settle).toHaveBeenCalledOnce();
  });
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

function failureFixture() {
  const job = {
    revisionId: 'revision',
    organizationId: 'org',
    brandId: 'brand',
    userId: 'user',
  };
  const revision = {
    ...job,
    id: 'revision',
    status: 'queued',
    workflowExecutionId: null,
  } as unknown as VisualRevision;
  const pin = <T extends Record<string, string>>(
    id: string,
    definition: ReturnType<typeof buildVisualProjectWorkflowDefinition>,
    metadata: T,
  ) => ({
    id,
    workflowId: `${id}-workflow`,
    result: { inputValues: { job: structuredClone(job) }, metadata },
    workflowVersion: {
      workflowId: `${id}-workflow`,
      contentHash: buildWorkflowVersionDefinition(definition.definition)
        .contentHash,
    },
  });
  const original = pin('original', buildVisualProjectWorkflowDefinition(), {
    canonicalId: 'visual-code.execute',
  });
  const failure = pin(
    'failure',
    buildVisualProjectFailureWorkflowDefinition(),
    {
      canonicalId: 'visual-code.failure',
      source: 'workflow-failure:visual-code.execute',
      failedCanonicalId: 'visual-code.execute',
      failedJobId: 'system-workflow-original',
    },
  );
  const handlers = new Map<string, SystemWorkflowActionExecutor>();
  const terminalFailures = new Map<
    string,
    SystemWorkflowTerminalFailureHandler
  >();
  const workflows = {
    registerTerminalFailure: vi.fn((id, handler) =>
      terminalFailures.set(id, handler),
    ),
    registerWorkflow: vi.fn(),
    registerAction: vi.fn((id, handler) => handlers.set(id, handler)),
  };
  const prisma = {
    visualRevision: {
      findFirst: vi.fn(async () => revision),
      findFirstOrThrow: vi.fn(async () => revision),
    },
    workflowExecution: {
      findFirst: vi.fn(async () => ({ id: original.id })),
      findFirstOrThrow: vi.fn(async ({ where }) =>
        where.id === 'failure' ? failure : original,
      ),
    },
    workflow: {
      findFirstOrThrow: vi.fn(async ({ where }) => ({
        metadata: {
          sourceType: 'hidden-system-workflow',
          systemWorkflow: buildHiddenSystemWorkflowMetadata({
            canonicalId:
              where.id === 'failure-workflow'
                ? 'visual-code.failure'
                : 'visual-code.execute',
          }),
        },
      })),
    },
    workflowNodeClaim: {
      findFirst: vi.fn(
        async (): Promise<{ leaseOwnerId: string } | null> => ({
          leaseOwnerId: 'failure-owner',
        }),
      ),
    },
  };
  const dispatch = {
    reconcileFailedExecution: vi.fn(async (_revision, _executionId, check) => {
      await check();
      revision.status = 'failed';
    }),
  };
  const authorization = {
    authorizeBrand: vi
      .fn()
      .mockRejectedValue(new ForbiddenException('Actor revoked')),
  };
  const moduleAccess = {
    assertAccess: vi
      .fn()
      .mockRejectedValue(new ForbiddenException('Motion disabled')),
  };
  const authoring = { call: vi.fn() };
  const renderer = { execute: vi.fn() };
  const service = new VisualProjectWorkflowService(
    prisma as never,
    workflows as never,
    authorization as never,
    authoring as never,
    {} as never,
    renderer as never,
    {} as never,
    moduleAccess as never,
    dispatch as never,
  );
  service.onModuleInit();
  const request = {
    input: { job },
    context: {
      organizationId: 'org',
      userId: 'user',
      executionId: 'failure',
      runId: 'failure',
    } as never,
    provenance: {
      executionId: 'failure',
      nodeId: 'fail',
      workflowId: 'failure-workflow',
      workflowLabel: 'Failure',
    },
  };
  const run = () => handlers.get('visual-code.fail-internal')?.(request);
  const settle = (organizationId = 'org') =>
    terminalFailures.get('visual-code.execute')?.({
      inputValues: { job },
      organizationId,
      workflowError: 'Action contract input validation failed',
    });
  return {
    run,
    settle,
    request,
    prisma,
    dispatch,
    original,
    failure,
    revision,
    authorization,
    moduleAccess,
    authoring,
    renderer,
    workflows,
  };
}

describe('Motion last-resort terminal failure (#6655)', () => {
  it('stops an unreconciled revision through the normal reconciliation', async () => {
    const f = failureFixture();

    await f.settle();

    expect(f.dispatch.reconcileFailedExecution).toHaveBeenCalledWith(
      f.revision,
      'original',
      expect.any(Function),
    );
    expect(f.prisma.workflowExecution.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        idempotencyKey: 'visual-code-revision',
        isDeleted: false,
        organizationId: 'org',
        userId: 'user',
      },
    });
  });

  it('leaves a terminal revision untouched', async () => {
    const f = failureFixture();
    f.revision.status = 'completed';

    await f.settle();

    expect(f.dispatch.reconcileFailedExecution).not.toHaveBeenCalled();
  });

  it('refuses a job from another tenant', async () => {
    const f = failureFixture();

    await expect(f.settle('other-org')).rejects.toThrow();
    expect(f.dispatch.reconcileFailedExecution).not.toHaveBeenCalled();
  });
});

describe('Motion internal terminal admission proof', () => {
  it('permits only scoped terminal cleanup after access or actor revocation without provider work', async () => {
    const f = failureFixture();
    await expect(f.run()).resolves.toEqual({
      revisionId: 'revision',
      status: 'failed',
    });
    expect(f.dispatch.reconcileFailedExecution).toHaveBeenCalledWith(
      f.revision,
      'original',
      expect.any(Function),
    );
    expect(f.authorization.authorizeBrand).not.toHaveBeenCalled();
    expect(f.moduleAccess.assertAccess).not.toHaveBeenCalled();
    expect(f.authoring.call).not.toHaveBeenCalled();
    expect(f.renderer.execute).not.toHaveBeenCalled();
    expect(f.prisma.workflowExecution.findFirstOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org',
          userId: 'user',
          isDeleted: false,
          idempotencyKey: 'visual-code-revision',
        },
      }),
    );
    expect(f.prisma.visualRevision.findFirstOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'revision',
          organizationId: 'org',
          brandId: 'brand',
          userId: 'user',
          isDeleted: false,
        },
      }),
    );
  });
  it.each(['organizationId', 'userId'] as const)(
    'rejects conflicting request %s before lookup',
    async (key) => {
      const f = failureFixture();
      f.request.input.job[key] = 'foreign';
      await expect(f.run()).rejects.toThrow('visual_worker_scope_mismatch');
      expect(f.prisma.visualRevision.findFirstOrThrow).not.toHaveBeenCalled();
      expect(f.dispatch.reconcileFailedExecution).not.toHaveBeenCalled();
    },
  );
  it.each(['revisionId', 'organizationId', 'brandId', 'userId'] as const)(
    'rejects a foreign original admitted %s',
    async (key) => {
      const f = failureFixture();
      f.original.result.inputValues.job[key] = 'foreign';
      await expect(f.run()).rejects.toThrow('visual_worker_binding_invalid');
      expect(f.dispatch.reconcileFailedExecution).not.toHaveBeenCalled();
    },
  );
  it.each(['original', 'failure'] as const)(
    'rejects altered immutable %s graph',
    async (key) => {
      const f = failureFixture();
      f[key].workflowVersion.contentHash = 'edited';
      await expect(f.run()).rejects.toThrow('visual_worker_binding_invalid');
      expect(f.dispatch.reconcileFailedExecution).not.toHaveBeenCalled();
    },
  );
  it('rejects a failure attributed to another job or a different bound original execution', async () => {
    const f = failureFixture();
    f.failure.result.metadata.failedJobId = 'foreign-job';
    await expect(f.run()).rejects.toThrow('visual_worker_binding_invalid');
    f.failure.result.metadata.failedJobId = 'system-workflow-original';
    f.revision.workflowExecutionId = 'different-original';
    await expect(f.run()).rejects.toThrow('visual_worker_binding_invalid');
    expect(f.dispatch.reconcileFailedExecution).not.toHaveBeenCalled();
  });
  it('rejects edited/nonprotected mirrors and stale or lost failure leases', async () => {
    const f = failureFixture();
    f.prisma.workflow.findFirstOrThrow.mockResolvedValueOnce({
      metadata: {},
    } as never);
    await expect(f.run()).rejects.toThrow('visual_worker_binding_invalid');
    f.prisma.workflowNodeClaim.findFirst.mockResolvedValueOnce(null);
    await expect(f.run()).rejects.toThrow();
    f.prisma.workflowNodeClaim.findFirst
      .mockResolvedValueOnce({ leaseOwnerId: 'failure-owner' })
      .mockResolvedValueOnce(null);
    await expect(f.run()).rejects.toThrow();
    expect(f.authoring.call).not.toHaveBeenCalled();
  });
});
