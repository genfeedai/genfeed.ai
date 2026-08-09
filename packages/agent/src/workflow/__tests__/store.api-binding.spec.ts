import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAgentWorkflowStore } from '../store';
import type {
  WorkflowApiService,
  WorkflowApiState,
} from '../workflow-api.service';

function getState() {
  return useAgentWorkflowStore.getState();
}

function makeApiState(
  overrides: Partial<WorkflowApiState> = {},
): WorkflowApiState {
  return {
    agentId: 'agent-1',
    approaches: [],
    currentPhase: 'clarifying',
    gateStatus: {
      awaiting_approval: false,
      clarifying: false,
      complete: false,
      exploring: true,
      implementing: false,
      proposing: false,
      verifying: false,
    },
    id: 'wf-1',
    isLocked: false,
    linkedConversationId: null,
    messages: [],
    phaseHistory: [],
    questions: [],
    selectedApproachId: null,
    verificationEvidence: [],
    ...overrides,
  };
}

function makeApiService(
  overrides: Partial<WorkflowApiService> = {},
): WorkflowApiService {
  return {
    approve: vi.fn().mockResolvedValue({
      workflow: makeApiState({ currentPhase: 'implementing' }),
    }),
    createWorkflow: vi.fn().mockResolvedValue(makeApiState()),
    forceAdvance: vi.fn().mockResolvedValue({
      workflow: makeApiState({ currentPhase: 'proposing' }),
    }),
    getWorkflow: vi.fn().mockResolvedValue(makeApiState()),
    rollback: vi.fn().mockResolvedValue({
      workflow: makeApiState({ currentPhase: 'exploring' }),
    }),
    transition: vi.fn().mockResolvedValue({
      workflow: makeApiState({ currentPhase: 'clarifying' }),
    }),
    ...overrides,
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('AgentWorkflowStore API binding', () => {
  afterEach(() => {
    useAgentWorkflowStore.setState({ apiBinding: null });
    getState().reset();
  });

  it('bindApi hydrates local state from the remote workflow', async () => {
    const apiService = makeApiService({
      getWorkflow: vi.fn().mockResolvedValue(
        makeApiState({
          currentPhase: 'proposing',
          isLocked: true,
          selectedApproachId: 'appr-1',
        }),
      ),
    });

    await getState().bindApi('wf-1', apiService);

    expect(apiService.getWorkflow).toHaveBeenCalledWith('wf-1');
    expect(getState().phase).toBe('proposing');
    expect(getState().isLocked).toBe(true);
    expect(getState().selectedApproachId).toBe('appr-1');
    expect(getState().apiBinding?.workflowId).toBe('wf-1');
  });

  it('advance calls the API and reconciles with the server state', async () => {
    const apiService = makeApiService({
      getWorkflow: vi
        .fn()
        .mockResolvedValue(makeApiState({ currentPhase: 'exploring' })),
      transition: vi.fn().mockResolvedValue({
        workflow: makeApiState({ currentPhase: 'clarifying', isLocked: true }),
      }),
    });
    await getState().bindApi('wf-1', apiService);

    const result = getState().advance('agent');
    expect(result).toBe(true);
    expect(getState().phase).toBe('clarifying');

    await flushMicrotasks();

    expect(apiService.transition).toHaveBeenCalledWith(
      'wf-1',
      expect.objectContaining({ isLocked: false, questions: [] }),
    );
    expect(getState().isLocked).toBe(true);
  });

  it('advance rolls back the optimistic update when the API fails', async () => {
    const apiService = makeApiService({
      getWorkflow: vi
        .fn()
        .mockResolvedValue(makeApiState({ currentPhase: 'exploring' })),
      transition: vi.fn().mockRejectedValue(new Error('boom')),
    });
    await getState().bindApi('wf-1', apiService);

    getState().advance('agent');
    expect(getState().phase).toBe('clarifying');

    await flushMicrotasks();

    expect(getState().phase).toBe('exploring');
    expect(getState().transitions).toHaveLength(0);
  });

  it('approveApproach calls approve and reconciles on success', async () => {
    const apiService = makeApiService({
      getWorkflow: vi.fn().mockResolvedValue(
        makeApiState({
          approaches: [
            {
              description: 'D',
              id: 'appr-1',
              recommended: true,
              title: 'A',
              tradeoffs: { cons: [], pros: [] },
            },
          ],
          currentPhase: 'awaiting_approval',
          selectedApproachId: 'appr-1',
        }),
      ),
    });
    await getState().bindApi('wf-1', apiService);

    const result = getState().approveApproach();
    expect(result).toBe(true);
    expect(getState().phase).toBe('implementing');

    await flushMicrotasks();

    expect(apiService.approve).toHaveBeenCalledWith(
      'wf-1',
      expect.objectContaining({ selectedApproachId: 'appr-1' }),
    );
    expect(getState().phase).toBe('implementing');
  });

  it('approveApproach rolls back when the API rejects', async () => {
    const apiService = makeApiService({
      approve: vi.fn().mockRejectedValue(new Error('denied')),
      getWorkflow: vi.fn().mockResolvedValue(
        makeApiState({
          currentPhase: 'awaiting_approval',
          selectedApproachId: 'appr-1',
        }),
      ),
    });
    await getState().bindApi('wf-1', apiService);

    getState().approveApproach();
    await flushMicrotasks();

    expect(getState().phase).toBe('awaiting_approval');
  });

  it('approveApproach fails outside awaiting_approval', async () => {
    const apiService = makeApiService({
      getWorkflow: vi
        .fn()
        .mockResolvedValue(makeApiState({ currentPhase: 'exploring' })),
    });
    await getState().bindApi('wf-1', apiService);

    expect(getState().approveApproach()).toBe(false);
  });

  it('forceAdvance reconciles with the API and rolls back on failure', async () => {
    const apiService = makeApiService({
      forceAdvance: vi.fn().mockRejectedValue(new Error('nope')),
      getWorkflow: vi
        .fn()
        .mockResolvedValue(makeApiState({ currentPhase: 'exploring' })),
    });
    await getState().bindApi('wf-1', apiService);

    const result = getState().forceAdvance();
    expect(result).toBe(true);
    expect(getState().phase).toBe('clarifying');

    await flushMicrotasks();

    expect(apiService.forceAdvance).toHaveBeenCalledWith('wf-1');
    expect(getState().phase).toBe('exploring');
  });

  it('rollback calls the API and reconciles on success', async () => {
    const apiService = makeApiService({
      getWorkflow: vi
        .fn()
        .mockResolvedValue(makeApiState({ currentPhase: 'proposing' })),
      rollback: vi.fn().mockResolvedValue({
        workflow: makeApiState({ currentPhase: 'exploring' }),
      }),
    });
    await getState().bindApi('wf-1', apiService);

    const result = getState().rollback('exploring');
    expect(result).toBe(true);

    await flushMicrotasks();

    expect(apiService.rollback).toHaveBeenCalledWith('wf-1', 'exploring');
    expect(getState().phase).toBe('exploring');
  });

  it('rollback restores prior state when the API rejects', async () => {
    const apiService = makeApiService({
      getWorkflow: vi
        .fn()
        .mockResolvedValue(makeApiState({ currentPhase: 'proposing' })),
      rollback: vi.fn().mockRejectedValue(new Error('locked')),
    });
    await getState().bindApi('wf-1', apiService);

    getState().rollback('exploring');
    expect(getState().phase).toBe('exploring');

    await flushMicrotasks();

    expect(getState().phase).toBe('proposing');
  });

  it('reset keeps the API binding', async () => {
    const apiService = makeApiService();
    await getState().bindApi('wf-1', apiService);

    getState().reset();

    expect(getState().apiBinding?.workflowId).toBe('wf-1');
    expect(getState().phase).toBe('exploring');
  });
});
