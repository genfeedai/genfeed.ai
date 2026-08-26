import { beforeEach, describe, expect, it, type vi } from 'vitest';
import type { WorkflowApiState } from '../workflow-api.service';
import {
  createWorkflowApiService,
  mapApiStateToLocal,
} from '../workflow-api.service';

function makeApiState(
  overrides: Partial<WorkflowApiState> = {},
): WorkflowApiState {
  return {
    agentId: 'agent-1',
    approaches: [],
    currentPhase: 'exploring',
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

function mockFetchOnce(payload: unknown, ok = true, status = 200): void {
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    json: () => Promise.resolve(payload),
    ok,
    status,
    statusText: ok ? 'OK' : 'Server Error',
  });
}

describe('createWorkflowApiService', () => {
  const baseUrl = 'https://api.test';

  beforeEach(() => {
    (global.fetch as ReturnType<typeof vi.fn>).mockReset();
  });

  it('getWorkflow issues an authorized GET request', async () => {
    const service = createWorkflowApiService(baseUrl, () => 'token-1');
    mockFetchOnce(makeApiState());

    const result = await service.getWorkflow('wf-1');

    expect(result.id).toBe('wf-1');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/api/agent-workflows/wf-1',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token-1',
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('omits the Authorization header without a token', async () => {
    const service = createWorkflowApiService(baseUrl, () => null);
    mockFetchOnce(makeApiState());

    await service.getWorkflow('wf-1');

    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call?.[1]?.headers).not.toHaveProperty('Authorization');
  });

  it('createWorkflow POSTs the agent and conversation ids', async () => {
    const service = createWorkflowApiService(baseUrl, () => null);
    mockFetchOnce(makeApiState());

    await service.createWorkflow('agent-1', 'conv-1');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/api/agent-workflows',
      expect.objectContaining({
        body: JSON.stringify({
          agentId: 'agent-1',
          linkedConversationId: 'conv-1',
        }),
        method: 'POST',
      }),
    );
  });

  it('routes all transition methods through the workflow PATCH event endpoint', async () => {
    const service = createWorkflowApiService(baseUrl, () => null);
    const payload = {
      approaches: [],
      isLocked: false,
      messages: [],
      questions: [],
      selectedApproachId: null,
      verificationEvidence: [],
    };

    mockFetchOnce({ workflow: makeApiState() });
    await service.transition('wf-1', payload);
    mockFetchOnce({ workflow: makeApiState() });
    await service.approve('wf-1', payload);
    mockFetchOnce({ workflow: makeApiState() });
    await service.rollback('wf-1', 'exploring');
    mockFetchOnce({ workflow: makeApiState() });
    await service.forceAdvance('wf-1');

    const url = 'https://api.test/api/agent-workflows/wf-1';
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      url,
      expect.objectContaining({
        body: JSON.stringify({ event: 'advance', ...payload }),
        method: 'PATCH',
      }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      url,
      expect.objectContaining({
        body: JSON.stringify({ event: 'approve', ...payload }),
        method: 'PATCH',
      }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      3,
      url,
      expect.objectContaining({
        body: JSON.stringify({
          event: 'rollback',
          targetPhase: 'exploring',
        }),
        method: 'PATCH',
      }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      4,
      url,
      expect.objectContaining({
        body: JSON.stringify({ event: 'advance', force: true }),
        method: 'PATCH',
      }),
    );
    expect(
      (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map(
        (call) => call[0],
      ),
    ).toEqual([url, url, url, url]);
  });

  it('rejects with a descriptive error on non-ok responses', async () => {
    const service = createWorkflowApiService(baseUrl, () => null);
    mockFetchOnce({}, false, 500);

    await expect(service.getWorkflow('wf-1')).rejects.toThrow(
      'Workflow API error: 500 Server Error',
    );
  });

  it('forwards an AbortSignal to fetch', async () => {
    const service = createWorkflowApiService(baseUrl, () => null);
    const controller = new AbortController();
    mockFetchOnce(makeApiState());

    await service.getWorkflow('wf-1', controller.signal);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});

describe('mapApiStateToLocal', () => {
  it('maps API fields and normalizes timestamps', () => {
    const local = mapApiStateToLocal(
      makeApiState({
        currentPhase: 'proposing',
        messages: [
          {
            content: 'hello',
            id: 'msg-1',
            phase: 'exploring',
            role: 'agent',
            timestamp: '2026-03-26T10:00:00.000Z' as unknown as number,
          },
          {
            content: 'numeric',
            id: 'msg-2',
            phase: 'exploring',
            role: 'user',
            timestamp: 1750000000000,
          },
        ],
        phaseHistory: [
          {
            actor: 'agent',
            from: 'exploring',
            timestamp: '2026-03-26T10:00:00.000Z',
            to: 'clarifying',
            trigger: 'gate_met',
          },
        ],
        selectedApproachId: 'appr-1',
      }),
    );

    expect(local.phase).toBe('proposing');
    expect(local.selectedApproachId).toBe('appr-1');
    expect(local.messages[0]?.timestamp).toBe(
      new Date('2026-03-26T10:00:00.000Z').getTime(),
    );
    expect(local.messages[1]?.timestamp).toBe(1750000000000);
    expect(local.transitions[0]).toMatchObject({
      actor: 'agent',
      from: 'exploring',
      to: 'clarifying',
      trigger: 'gate_met',
    });
    expect(local.transitions[0]?.timestamp).toBe(
      new Date('2026-03-26T10:00:00.000Z').getTime(),
    );
  });
});
