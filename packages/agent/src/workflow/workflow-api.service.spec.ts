import { WORKFLOW_PHASES } from '@genfeedai/agent/workflow/types';
import {
  createWorkflowApiService,
  type TransitionResponse,
} from '@genfeedai/agent/workflow/workflow-api.service';
import { ORGANIZATION_CONTEXT_HEADER } from '@genfeedai/contracts/constants';
import {
  clearRequestOrganizationId,
  setRequestOrganizationId,
} from '@genfeedai/services/core/interceptor.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// AgentWorkflowsController.applyEvent() always answers `{ workflow }`.
const FORCE_ADVANCE_RESPONSE: TransitionResponse = {
  workflow: {
    agentId: 'agent-1',
    approaches: [],
    currentPhase: 'clarifying',
    // An unlocked workflow always meets the exploring and implementing gates.
    gateStatus: Object.fromEntries(
      WORKFLOW_PHASES.map((phase) => [
        phase,
        phase === 'exploring' || phase === 'implementing',
      ]),
    ) as TransitionResponse['workflow']['gateStatus'],
    id: 'workflow-1',
    isLocked: false,
    linkedConversationId: null,
    messages: [],
    phaseHistory: [
      {
        actor: 'user',
        from: 'exploring',
        timestamp: '2026-09-27T12:00:00.000Z',
        to: 'clarifying',
        trigger: 'force_advance',
      },
    ],
    questions: [],
    selectedApproachId: null,
    verificationEvidence: [],
  },
};

describe('createWorkflowApiService', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      json: async () => FORCE_ADVANCE_RESPONSE,
      ok: true,
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearRequestOrganizationId();
  });

  it('sends the confirmed routed organization so the API fails closed on drift', async () => {
    setRequestOrganizationId('org_alpha');
    const service = createWorkflowApiService('https://api.test', () => 'tok');

    const response = await service.forceAdvance('workflow-1');

    expect(response).toEqual(FORCE_ADVANCE_RESPONSE);
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer tok',
      [ORGANIZATION_CONTEXT_HEADER]: 'org_alpha',
    });
  });
});
