import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
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
