import { KnowledgeSourceIngestWorkflowService } from '@api/collections/contexts/services/knowledge-source-ingest-workflow.service';
import { KNOWLEDGE_SOURCE_ACTION_IDS } from '@api/collections/contexts/services/knowledge-source-ingest-workflow-definition';
import { validateKnowledgeWorkflowAction } from '@api/collections/contexts/utils/knowledge-workflow-actor.util';
import type { SystemWorkflowActionRequest } from '@api/collections/workflows/system-workflow-runner.service';
import { describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/collections/contexts/utils/knowledge-workflow-actor.util',
  async () => {
    const actual = await vi.importActual<
      typeof import('@api/collections/contexts/utils/knowledge-workflow-actor.util')
    >('@api/collections/contexts/utils/knowledge-workflow-actor.util');
    return { ...actual, validateKnowledgeWorkflowAction: vi.fn() };
  },
);

function fixture() {
  const actor = {
    organizationId: 'org',
    userId: 'actual-user',
    isApiKey: false,
    scopes: [],
  };
  vi.mocked(validateKnowledgeWorkflowAction).mockResolvedValue({
    organizationId: 'org',
    sourceId: 'source',
    versionId: 'version',
    initiatingActor: actor,
  });
  const actions = new Map<
    string,
    (action: SystemWorkflowActionRequest) => Promise<unknown>
  >();
  const ingest = {
    replaceChunks: vi.fn().mockResolvedValue({}),
    finalizeSource: vi.fn().mockResolvedValue({ status: 'queued' }),
  };
  const runner = {
    registerAction: vi.fn().mockImplementation((id, handler) => {
      actions.set(id, handler);
    }),
    registerWorkflow: vi.fn(),
  };
  const service = new KnowledgeSourceIngestWorkflowService(
    ingest as never,
    {} as never,
    runner as never,
    {} as never,
    {} as never,
  );
  service.onModuleInit();
  const state = {
    organizationId: 'org',
    sourceId: 'source',
    versionId: 'version',
    status: 'ready',
    embeddingManifestId: undefined,
    admissionExecutionId: 'untrusted-state-value',
  };
  const action = {
    context: {
      organizationId: 'org',
      userId: 'actual-user',
      executionId: 'persisted-execution',
      workflowId: 'pinned-workflow',
      workflowVersionId: 'pinned-version',
    },
    provenance: {
      executionId: 'persisted-execution',
      workflowId: 'pinned-workflow',
    },
    input: { state },
  } as unknown as SystemWorkflowActionRequest;
  return { ingest, actions, service, actor, state, action };
}
describe('Knowledge workflow admission boundary', () => {
  it('uses the validated server execution identity rather than an incoming state execution field', async () => {
    const f = fixture();
    await f.actions.get(KNOWLEDGE_SOURCE_ACTION_IDS.REPLACE)?.(f.action);
    expect(validateKnowledgeWorkflowAction).toHaveBeenCalledOnce();
    expect(f.ingest.replaceChunks).toHaveBeenCalledExactlyOnceWith(
      { ...f.state, initiatingActor: f.actor },
      'persisted-execution',
    );
  });
  it('rejects inconsistent server provenance before any chunk staging', async () => {
    const f = fixture();
    f.action.provenance.executionId = 'different-execution';
    await expect(
      f.actions.get(KNOWLEDGE_SOURCE_ACTION_IDS.REPLACE)?.(f.action),
    ).rejects.toThrow();
    expect(f.ingest.replaceChunks).not.toHaveBeenCalled();
  });
  it('lets an older workflow state derive its committed manifest at finalization without declaring immediate readiness', async () => {
    const f = fixture();
    await f.actions.get(KNOWLEDGE_SOURCE_ACTION_IDS.FINALIZE)?.(f.action);
    expect(f.ingest.finalizeSource).toHaveBeenCalledExactlyOnceWith(
      { ...f.state, initiatingActor: f.actor },
      undefined,
    );
  });
});
