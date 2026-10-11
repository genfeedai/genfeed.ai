import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import {
  admitBreakoutResponseExecution,
  buildBreakoutResponseExecutionRequest,
  reauthorizeBreakoutActor,
} from '@api/collections/outliers/services/breakout-response-execution-admission.util';
import {
  BREAKOUT_RESPONSE_WORKFLOW_ID,
  BREAKOUT_RESPONSE_WORKFLOW_SOURCE,
} from '@api/collections/outliers/services/breakout-response-execution-workflow-definition';
import {
  buildHiddenSystemWorkflowMetadata,
  SYSTEM_WORKFLOW_PRINCIPAL_ID,
} from '@api/collections/workflows/system-workflow.contract';
import type { SystemWorkflowActionRequest } from '@api/collections/workflows/system-workflow-runner.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MemberRole, Platform } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ cloud: true }));
vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  isCloudDeployment: () => runtime.cloud,
}));

const actor = {
  userId: 'opaque-user',
  organizationId: 'org',
  isApiKey: false,
  scopes: [],
};
const scope = {
  brandId: 'brand',
  credentialId: 'credential',
  organizationId: 'org',
  platform: Platform.TWITTER,
  responseId: 'response',
  strategyId: 'strategy',
};

function fixture(overrides: { memberBrands?: Array<{ id: string }> } = {}) {
  const stored = buildBreakoutResponseExecutionRequest(scope, actor);
  const execution = {
    id: 'run',
    organizationId: 'org',
    userId: actor.userId,
    workflowId: 'workflow',
    workflowVersionId: 'pinned',
    workflow: {
      organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
      userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
      isDeleted: false,
      metadata: {
        sourceType: 'hidden-system-workflow',
        systemWorkflow: buildHiddenSystemWorkflowMetadata({
          canonicalId: BREAKOUT_RESPONSE_WORKFLOW_ID,
        }),
      },
    },
    workflowVersion: {
      organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
      userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
      workflowId: 'workflow',
    },
    result: {
      inputValues: { request: stored },
      metadata: {
        source: BREAKOUT_RESPONSE_WORKFLOW_SOURCE,
        canonicalId: BREAKOUT_RESPONSE_WORKFLOW_ID,
      },
    } as Record<string, unknown>,
  };
  const findExecution = vi.fn().mockResolvedValue(execution);
  const findMember = vi.fn().mockResolvedValue({
    role: { key: MemberRole.CREATOR },
    brands: overrides.memberBrands ?? [{ id: 'brand' }],
  });
  const findBrand = vi.fn().mockResolvedValue({ id: 'brand' });
  const findKey = vi.fn().mockResolvedValue({ scopes: ['analytics:read'] });
  const prisma = {
    member: { findFirst: findMember },
    brand: { findFirst: findBrand },
    apiKey: { findFirst: findKey },
    workflowExecution: { findFirst: findExecution },
  } as unknown as PrismaService;
  const action = {
    context: {
      organizationId: 'org',
      userId: actor.userId,
      workflowId: 'workflow',
      workflowVersionId: 'pinned',
      runId: 'run',
    },
    provenance: {
      executionId: 'run',
      workflowId: 'workflow',
      workflowLabel: 'Breakout',
    },
    input: { request: stored },
  } satisfies SystemWorkflowActionRequest;
  return {
    stored,
    execution,
    action,
    prisma,
    policy: new BrandAccessService(prisma),
    findExecution,
    findMember,
    findBrand,
    findKey,
  };
}

describe('breakout response execution admission', () => {
  beforeEach(() => {
    runtime.cloud = true;
  });

  it('admits the pinned hidden execution and returns only the persisted scope and actor', async () => {
    const f = fixture();
    const admitted = await admitBreakoutResponseExecution(
      f.prisma,
      f.policy,
      f.action,
      { ...f.stored, extra: 'ignored' },
    );
    expect(admitted).toEqual({
      initiatingActor: actor,
      scope,
      workflowExecutionId: 'run',
    });
    expect(f.findExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org' }),
      }),
    );
    expect(f.findMember).toHaveBeenCalled();
    expect(f.findBrand).toHaveBeenCalled();
  });

  it('never takes the actor or scope from node input', async () => {
    const f = fixture();
    const forged = {
      ...f.stored,
      initiatingActor: { ...actor, userId: 'attacker' },
    };
    const admitted = await admitBreakoutResponseExecution(
      f.prisma,
      f.policy,
      f.action,
      forged,
    );
    expect(admitted.initiatingActor.userId).toBe(actor.userId);
    await expect(
      admitBreakoutResponseExecution(f.prisma, f.policy, f.action, {
        ...f.stored,
        responseId: 'other-response',
      }),
    ).rejects.toThrow('Breakout execution denied');
    await expect(
      admitBreakoutResponseExecution(f.prisma, f.policy, f.action, {
        ...f.stored,
        strategyId: 'other-strategy',
      }),
    ).rejects.toThrow('Breakout execution denied');
  });

  it.each([
    [
      'a missing bound actor',
      (r: Record<string, unknown>) => delete r.initiatingActor,
    ],
    [
      'an actor of another user',
      (r: Record<string, unknown>) => {
        r.initiatingActor = { ...actor, userId: 'someone-else' };
      },
    ],
    [
      'an actor of another organization',
      (r: Record<string, unknown>) => {
        r.initiatingActor = { ...actor, organizationId: 'foreign' };
      },
    ],
    [
      'an unknown platform',
      (r: Record<string, unknown>) => {
        r.platform = 'not-a-platform';
      },
    ],
    [
      'a scope field removed',
      (r: Record<string, unknown>) => delete r.credentialId,
    ],
  ])(
    'denies persisted work with %s, even outside Cloud',
    async (_name, mutate) => {
      for (const cloud of [true, false]) {
        runtime.cloud = cloud;
        const f = fixture();
        const request = { ...f.stored } as Record<string, unknown>;
        mutate(request);
        f.execution.result = {
          ...f.execution.result,
          inputValues: { request },
        };
        await expect(
          admitBreakoutResponseExecution(f.prisma, f.policy, f.action, {
            ...f.stored,
          }),
        ).rejects.toThrow('Breakout execution denied');
      }
    },
  );

  it.each([
    [
      'another workflow',
      (e: ReturnType<typeof fixture>['execution']) => {
        e.result.metadata = {
          source: BREAKOUT_RESPONSE_WORKFLOW_SOURCE,
          canonicalId: 'knowledge.source.ingest',
        };
      },
    ],
    [
      'another producer',
      (e: ReturnType<typeof fixture>['execution']) => {
        e.result.metadata = {
          source: 'manual',
          canonicalId: BREAKOUT_RESPONSE_WORKFLOW_ID,
        };
      },
    ],
    [
      'a child of another workflow',
      (e: ReturnType<typeof fixture>['execution']) => {
        e.result.metadata = {
          source: BREAKOUT_RESPONSE_WORKFLOW_SOURCE,
          canonicalId: BREAKOUT_RESPONSE_WORKFLOW_ID,
          parentExecutionId: 'parent',
        };
      },
    ],
    [
      'a tenant-owned mirror',
      (e: ReturnType<typeof fixture>['execution']) => {
        e.workflow.organizationId = 'org';
      },
    ],
    [
      'a mirror that is not hidden',
      (e: ReturnType<typeof fixture>['execution']) => {
        e.workflow.metadata = { sourceType: 'user' } as never;
      },
    ],
    [
      'a different pinned version',
      (e: ReturnType<typeof fixture>['execution']) => {
        e.workflowVersionId = 'edited';
      },
    ],
  ])('denies an execution that is %s', async (_name, mutate) => {
    const f = fixture();
    mutate(f.execution);
    await expect(
      admitBreakoutResponseExecution(f.prisma, f.policy, f.action, f.stored),
    ).rejects.toThrow('Breakout execution denied');
  });

  it('denies when the execution row is not found in the tenant', async () => {
    const f = fixture();
    f.findExecution.mockResolvedValue(null);
    await expect(
      admitBreakoutResponseExecution(f.prisma, f.policy, f.action, f.stored),
    ).rejects.toThrow('Breakout execution denied');
  });

  it('denies when provenance does not match the running node', async () => {
    const f = fixture();
    await expect(
      admitBreakoutResponseExecution(
        f.prisma,
        f.policy,
        {
          ...f.action,
          provenance: { ...f.action.provenance, executionId: 'other' },
        },
        f.stored,
      ),
    ).rejects.toThrow('Breakout execution denied');
    expect(f.findExecution).not.toHaveBeenCalled();
  });

  describe('live reauthorization', () => {
    it('denies once the member lost the brand', async () => {
      const f = fixture({ memberBrands: [] });
      f.findBrand.mockResolvedValue(null);
      await expect(
        reauthorizeBreakoutActor(f.prisma, f.policy, {
          initiatingActor: actor,
          scope,
        }),
      ).rejects.toThrow('Brand access denied');
    });

    it('denies once the membership is gone', async () => {
      const f = fixture();
      f.findMember.mockResolvedValue(null);
      await expect(
        reauthorizeBreakoutActor(f.prisma, f.policy, {
          initiatingActor: actor,
          scope,
        }),
      ).rejects.toThrow('Brand access denied');
    });

    it('denies a revoked or expired API key and never widens its scopes', async () => {
      const f = fixture();
      const keyActor = {
        ...actor,
        isApiKey: true,
        apiKeyId: 'key',
        scopes: ['analytics:read', 'admin'],
      };
      const refreshed = await reauthorizeBreakoutActor(f.prisma, f.policy, {
        initiatingActor: keyActor,
        scope,
      });
      expect(refreshed.scopes).toEqual(['analytics:read']);
      f.findKey.mockResolvedValue(null);
      await expect(
        reauthorizeBreakoutActor(f.prisma, f.policy, {
          initiatingActor: keyActor,
          scope,
        }),
      ).rejects.toThrow('Breakout execution denied');
    });
  });
});
