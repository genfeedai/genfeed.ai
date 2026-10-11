import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { BreakoutResponseExecutionWorkflowService } from '@api/collections/outliers/services/breakout-response-execution-workflow.service';
import {
  BREAKOUT_RESPONSE_ACTION_ID,
  BREAKOUT_RESPONSE_WORKFLOW_ID,
} from '@api/collections/outliers/services/breakout-response-execution-workflow-definition';
import type {
  SystemWorkflowActionRequest,
  SystemWorkflowGraphDefinition,
} from '@api/collections/workflows/system-workflow-runner.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Platform } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { vi } from 'vitest';

const admit = vi.hoisted(() => vi.fn());
const reauthorize = vi.hoisted(() => vi.fn());
vi.mock(
  '@api/collections/outliers/services/breakout-response-execution-admission.util',
  () => ({
    admitBreakoutResponseExecution: admit,
    reauthorizeBreakoutActor: reauthorize,
  }),
);

const admission = {
  initiatingActor: {
    userId: 'user-a',
    organizationId: 'org-a',
    isApiKey: false,
    scopes: [],
  },
  scope: {
    brandId: 'brand-a',
    credentialId: 'credential-a',
    organizationId: 'org-a',
    platform: Platform.TWITTER,
    responseId: 'response-a',
    strategyId: 'strategy-a',
  },
  workflowExecutionId: 'execution-a',
};

function harness() {
  let executor:
    | ((action: SystemWorkflowActionRequest) => Promise<unknown>)
    | undefined;
  const workflows: SystemWorkflowGraphDefinition[] = [];
  const runner = {
    registerAction: vi.fn((_id: string, fn: typeof executor) => {
      executor = fn;
    }),
    registerWorkflow: vi.fn((definition: SystemWorkflowGraphDefinition) => {
      workflows.push(definition);
    }),
  };
  const execute = vi.fn();
  const prisma = {} as PrismaService;
  const policy = {} as BrandAccessService;
  const service = new BreakoutResponseExecutionWorkflowService(
    { execute } as never,
    runner as never,
    prisma,
    policy,
  );
  service.onModuleInit();
  const action = {
    input: { request: { responseId: 'response-a' } },
  } as unknown as SystemWorkflowActionRequest;
  return {
    execute,
    executor: () => executor,
    runner,
    workflows,
    action,
    prisma,
    policy,
  };
}

describe('BreakoutResponseExecutionWorkflowService', () => {
  beforeEach(() => {
    admit.mockReset().mockResolvedValue(admission);
    reauthorize.mockReset().mockResolvedValue(undefined);
  });

  it('registers one system action and its hidden single-node workflow', () => {
    const h = harness();
    expect(h.runner.registerAction).toHaveBeenCalledOnce();
    expect(h.runner.registerAction.mock.calls[0][0]).toBe(
      BREAKOUT_RESPONSE_ACTION_ID,
    );
    expect(h.workflows).toHaveLength(1);
    expect(h.workflows[0].canonicalId).toBe(BREAKOUT_RESPONSE_WORKFLOW_ID);
    expect(h.workflows[0].definition.nodes).toHaveLength(1);
  });

  it('executes with the admitted scope, actor and live reauthorization', async () => {
    const h = harness();
    h.execute.mockResolvedValue({
      status: 'completed',
      responseId: 'response-a',
      reason: null,
      outputs: [
        { outputId: 'o-1', recovery: { status: 'unavailable' } },
        { outputId: 'o-2', recovery: { status: 'unavailable' } },
      ],
    });
    const result = await h.executor()?.(h.action);
    expect(admit).toHaveBeenCalledWith(
      h.prisma,
      h.policy,
      h.action,
      h.action.input.request,
    );
    expect(h.execute).toHaveBeenCalledWith({
      scope: {
        brandId: 'brand-a',
        credentialId: 'credential-a',
        organizationId: 'org-a',
        platform: Platform.TWITTER,
      },
      responseId: 'response-a',
      strategyId: 'strategy-a',
      actorUserId: 'user-a',
      workflowExecutionId: 'execution-a',
      reauthorize: expect.any(Function),
    });
    expect(result).toEqual({
      outputIds: ['o-1', 'o-2'],
      reason: null,
      responseId: 'response-a',
      status: 'completed',
    });
    const tx = {} as Prisma.TransactionClient;
    await h.execute.mock.calls[0][0].reauthorize(tx);
    expect(reauthorize).toHaveBeenCalledWith(tx, h.policy, admission);
  });

  it('returns held work without recovery detail', async () => {
    const h = harness();
    h.execute.mockResolvedValue({
      status: 'held',
      responseId: 'response-a',
      reason: 'model_unavailable',
      outputs: [],
    });
    await expect(h.executor()?.(h.action)).resolves.toEqual({
      outputIds: [],
      reason: 'model_unavailable',
      responseId: 'response-a',
      status: 'held',
    });
  });

  it('never executes when admission denies, and propagates reauthorization denial', async () => {
    const h = harness();
    admit.mockRejectedValue(new Error('Breakout execution denied'));
    await expect(h.executor()?.(h.action)).rejects.toThrow(
      'Breakout execution denied',
    );
    expect(h.execute).not.toHaveBeenCalled();
    admit.mockResolvedValue(admission);
    reauthorize.mockRejectedValue(new Error('Brand access denied'));
    h.execute.mockImplementation(
      async (request: { reauthorize: (tx: unknown) => Promise<void> }) => {
        await request.reauthorize({});
      },
    );
    await expect(h.executor()?.(h.action)).rejects.toThrow(
      'Brand access denied',
    );
  });
});
