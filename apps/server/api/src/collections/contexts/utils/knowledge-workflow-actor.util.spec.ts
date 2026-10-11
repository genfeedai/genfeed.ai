import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import {
  type ExecutionFixture,
  executionLookup,
  hiddenExecutionRow,
} from '@api/authorization/brand-access/hidden-execution-chain.fixture';
import { KNOWLEDGE_SOURCE_WORKFLOW_IDS } from '@api/collections/contexts/services/knowledge-source-ingest-workflow-definition';
import {
  knowledgeWorkflowActorKey,
  parseKnowledgeWorkflowActor,
  refreshKnowledgeWorkflowActor,
  validateKnowledgeWorkflowAction,
} from '@api/collections/contexts/utils/knowledge-workflow-actor.util';
import {
  buildHiddenSystemWorkflowMetadata,
  SYSTEM_WORKFLOW_PRINCIPAL_ID,
} from '@api/collections/workflows/system-workflow.contract';
import type { SystemWorkflowActionRequest } from '@api/collections/workflows/system-workflow-runner.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MemberRole } from '@genfeedai/contracts';
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
function fixture() {
  const stored = {
    organizationId: 'org',
    sourceId: 'source',
    versionId: 'version',
    initiatingActor: actor,
  };
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
          canonicalId: KNOWLEDGE_SOURCE_WORKFLOW_IDS.INGEST,
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
        source: 'knowledge-source',
        canonicalId: KNOWLEDGE_SOURCE_WORKFLOW_IDS.INGEST,
      },
    },
  };
  const findExecution = vi.fn().mockResolvedValue(execution);
  const findMember = vi
    .fn()
    .mockResolvedValue({ role: { key: MemberRole.ADMIN }, brands: [] });
  const findKey = vi
    .fn()
    .mockResolvedValue({ scopes: ['admin', 'knowledge:read'] });
  const prisma = {
    member: { findFirst: findMember },
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
      workflowLabel: 'Knowledge',
    },
    input: { request: stored },
  } satisfies SystemWorkflowActionRequest;
  const policy = new BrandAccessService(prisma);
  return {
    stored,
    execution,
    action,
    prisma,
    policy,
    findExecution,
    findMember,
    findKey,
  };
}
describe('server-owned queued Knowledge authority', () => {
  beforeEach(() => {
    runtime.cloud = true;
  });
  it('copies only authenticated fields and canonicalizes actor job identities', () => {
    expect(
      parseKnowledgeWorkflowActor(
        { ...actor, role: 'OWNER', maintenance: true, bearer: 'secret' },
        'org',
      ),
    ).toEqual(actor);
    expect(
      knowledgeWorkflowActorKey({ ...actor, scopes: ['b', 'a', 'b'] }),
    ).toEqual(knowledgeWorkflowActorKey({ ...actor, scopes: ['a', 'b'] }));
    expect(knowledgeWorkflowActorKey(actor)).not.toBe(
      knowledgeWorkflowActorKey({ ...actor, userId: 'other' }),
    );
  });
  it.each([
    undefined,
    { ...actor, userId: '' },
    { ...actor, organizationId: 'foreign' },
    { ...actor, scopes: ['admin', 1] },
    { ...actor, isApiKey: true },
  ])(
    'rejects malformed or actorless Cloud work before private reads: %j',
    (value) => {
      expect(() => parseKnowledgeWorkflowActor(value, 'org')).toThrow(
        'Knowledge access denied',
      );
    },
  );
  it('refreshes key authority by exact identity with no secret selection or scope expansion', async () => {
    const f = fixture();
    const result = await refreshKnowledgeWorkflowActor(
      f.prisma,
      f.policy,
      {
        ...actor,
        isApiKey: true,
        apiKeyId: 'key',
        scopes: ['admin', 'removed'],
      },
      'org',
    );
    expect(result?.scopes).toEqual(['admin']);
    expect(f.findKey).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { scopes: true },
        where: expect.objectContaining({
          id: 'key',
          userId: actor.userId,
          organizationId: 'org',
          isRevoked: false,
        }),
      }),
    );
    f.findKey.mockResolvedValue(null);
    await expect(
      refreshKnowledgeWorkflowActor(
        f.prisma,
        f.policy,
        { ...actor, isApiKey: true, apiKeyId: 'key' },
        'org',
      ),
    ).rejects.toThrow('Knowledge access denied');
  });
  it('reads the pinned execution request and checks live membership', async () => {
    const f = fixture();
    await expect(
      validateKnowledgeWorkflowAction(
        f.prisma,
        f.policy,
        f.action,
        KNOWLEDGE_SOURCE_WORKFLOW_IDS.INGEST,
        f.stored,
      ),
    ).resolves.toEqual(f.stored);
    f.findMember.mockResolvedValue(null);
    await expect(
      validateKnowledgeWorkflowAction(
        f.prisma,
        f.policy,
        f.action,
        KNOWLEDGE_SOURCE_WORKFLOW_IDS.INGEST,
        f.stored,
      ),
    ).rejects.toThrow('Brand access denied');
  });
  it.each(['customer', 'pin', 'scrubbed', 'tuple', 'user'] as const)(
    'denies %s execution before membership/private work',
    async (failure) => {
      const f = fixture();
      if (failure === 'customer') f.execution.workflow.organizationId = 'org';
      if (failure === 'pin') f.action.context.workflowVersionId = 'other';
      if (failure === 'scrubbed')
        f.execution.result.inputValues.request = {} as typeof f.stored;
      if (failure === 'tuple')
        f.action.input.request = { ...f.stored, sourceId: 'other' };
      if (failure === 'user') f.execution.userId = 'other';
      await expect(
        validateKnowledgeWorkflowAction(
          f.prisma,
          f.policy,
          f.action,
          KNOWLEDGE_SOURCE_WORKFLOW_IDS.INGEST,
          f.action.input.request,
        ),
      ).rejects.toThrow('Knowledge access denied');
      expect(f.findMember).not.toHaveBeenCalled();
    },
  );
  it('retains the actorless selfhost compatibility path only outside Cloud', async () => {
    const f = fixture();
    runtime.cloud = false;
    await expect(
      refreshKnowledgeWorkflowActor(f.prisma, f.policy, undefined, 'org'),
    ).resolves.toBeUndefined();
    expect(f.findMember).not.toHaveBeenCalled();
  });
});

describe('Knowledge backfill fan-out chain', () => {
  const stored = {
    organizationId: 'org',
    sourceId: 'source',
    versionId: 'version',
    initiatingActor: actor,
  };
  function chain() {
    const parent = hiddenExecutionRow({
      id: 'parent',
      canonicalId: KNOWLEDGE_SOURCE_WORKFLOW_IDS.BACKFILL,
      workflowId: 'backfill-workflow',
      userId: actor.userId,
      inputValues: {
        request: { organizationId: 'org', initiatingActor: actor },
      },
      metadata: { source: 'knowledge-source-backfill' },
    });
    const child = hiddenExecutionRow({
      id: 'run',
      canonicalId: KNOWLEDGE_SOURCE_WORKFLOW_IDS.INGEST,
      workflowId: 'workflow',
      versionId: 'pinned',
      userId: actor.userId,
      inputValues: { request: stored },
      metadata: {
        parentExecutionId: 'parent',
        parentNodeId: 'ingest-sources',
        parentWorkflowId: 'backfill-workflow',
        workflowForEachIndex: 1,
      },
    });
    return { child, parent };
  }
  function harness(rows: ExecutionFixture[]) {
    const findMember = vi
      .fn()
      .mockResolvedValue({ role: { key: MemberRole.ADMIN }, brands: [] });
    const findDiscovery = vi.fn().mockResolvedValue({
      output: { items: [{ sourceId: 'other' }, stored] },
    });
    const prisma = {
      member: { findFirst: findMember },
      apiKey: { findFirst: vi.fn() },
      workflowExecution: { findFirst: vi.fn(executionLookup(rows)) },
      workflowExecutionNodeResult: { findFirst: findDiscovery },
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
        workflowLabel: 'Knowledge',
      },
      input: { request: stored },
    } satisfies SystemWorkflowActionRequest;
    return {
      action,
      findDiscovery,
      findMember,
      policy: new BrandAccessService(prisma),
      prisma,
    };
  }
  const run = (h: ReturnType<typeof harness>) =>
    validateKnowledgeWorkflowAction(
      h.prisma,
      h.policy,
      h.action,
      KNOWLEDGE_SOURCE_WORKFLOW_IDS.INGEST,
      stored,
    );

  beforeEach(() => {
    runtime.cloud = true;
  });

  it('admits a child that its pinned hidden backfill parent discovered', async () => {
    const { child, parent } = chain();
    const h = harness([parent, child]);
    await expect(run(h)).resolves.toEqual(stored);
    expect(h.findMember).toHaveBeenCalledOnce();
  });

  it.each([
    [
      'a parent that is not the backfill workflow',
      (p: ExecutionFixture) => {
        p.workflow.metadata = hiddenExecutionRow({
          id: 'x',
          canonicalId: KNOWLEDGE_SOURCE_WORKFLOW_IDS.INGEST,
        }).workflow.metadata;
      },
    ],
    [
      'a parent that was not queued as a backfill',
      (p: ExecutionFixture) => {
        p.result.metadata.source = 'knowledge-source';
      },
    ],
    [
      'a customer-owned parent',
      (p: ExecutionFixture) => {
        p.workflow.organizationId = 'org';
      },
    ],
    [
      'a parent run by another user',
      (p: ExecutionFixture) => {
        p.userId = 'other';
      },
    ],
    [
      'a parent in another organization request',
      (p: ExecutionFixture) => {
        p.result.inputValues = {
          request: { organizationId: 'foreign', initiatingActor: actor },
        };
      },
    ],
    [
      'a parent actor that differs from the child actor',
      (p: ExecutionFixture) => {
        p.result.inputValues = {
          request: {
            organizationId: 'org',
            initiatingActor: { ...actor, scopes: ['admin'] },
          },
        };
      },
    ],
    [
      'a parent node other than the fan-out',
      (_p: ExecutionFixture, c: ExecutionFixture) => {
        c.result.metadata.parentNodeId = 'elsewhere';
      },
    ],
    [
      'an invalid fan-out index',
      (_p: ExecutionFixture, c: ExecutionFixture) => {
        c.result.metadata.workflowForEachIndex = 1.5;
      },
    ],
    [
      'a recorded parent workflow that differs',
      (_p: ExecutionFixture, c: ExecutionFixture) => {
        c.result.metadata.parentWorkflowId = 'other';
      },
    ],
    [
      'a child with no actor',
      (_p: ExecutionFixture, c: ExecutionFixture) => {
        c.result.inputValues = {
          request: { ...stored, initiatingActor: undefined },
        };
      },
    ],
  ])('denies %s before any membership read', async (_name, tamper) => {
    const { child, parent } = chain();
    tamper(parent, child);
    const h = harness([parent, child]);
    await expect(run(h)).rejects.toThrow('Knowledge access denied');
    expect(h.findMember).not.toHaveBeenCalled();
  });

  it.each([
    ['a different source', { items: [{}, { ...stored, sourceId: 'other' }] }],
    ['a different version', { items: [{}, { ...stored, versionId: 'other' }] }],
    [
      'a different actor',
      {
        items: [{}, { ...stored, initiatingActor: { ...actor, userId: 'x' } }],
      },
    ],
    ['another index', { items: [stored] }],
    ['no items', {}],
  ])('denies a parent that discovered %s', async (_name, output) => {
    const { child, parent } = chain();
    const h = harness([parent, child]);
    h.findDiscovery.mockResolvedValue({ output });
    await expect(run(h)).rejects.toThrow('Knowledge access denied');
    expect(h.findMember).not.toHaveBeenCalled();
  });

  it('denies a child whose discovery output is gone', async () => {
    const { child, parent } = chain();
    const h = harness([parent, child]);
    h.findDiscovery.mockResolvedValue(null);
    await expect(run(h)).rejects.toThrow('Knowledge access denied');
  });

  it('checks live membership after the chain holds', async () => {
    const { child, parent } = chain();
    const h = harness([parent, child]);
    h.findMember.mockResolvedValue(null);
    await expect(run(h)).rejects.toThrow('Brand access denied');
  });
});
