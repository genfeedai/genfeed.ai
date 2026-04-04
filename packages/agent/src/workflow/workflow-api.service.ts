import type {
  AgentWorkflowState,
  Approach,
  Evidence,
  PhaseMessage,
  Question,
  WorkflowPhase,
} from './types';

// ---------------------------------------------------------------------------
// API response types (based on GEN-122 contract)
// ---------------------------------------------------------------------------

export interface WorkflowApiState {
  id: string;
  agentId: string;
  currentPhase: WorkflowPhase;
  gateStatus: Record<WorkflowPhase, boolean>;
  phaseHistory: Array<{
    from: WorkflowPhase;
    to: WorkflowPhase;
    trigger: 'gate_met' | 'force_advance' | 'rollback';
    actor: 'user' | 'agent';
    timestamp: string;
  }>;
  linkedConversationId: string | null;
  questions: Question[];
  approaches: Approach[];
  selectedApproachId: string | null;
  verificationEvidence: Evidence[];
  messages: PhaseMessage[];
  isLocked: boolean;
}

export interface WorkflowApiStatePayload {
  questions: Question[];
  approaches: Approach[];
  selectedApproachId: string | null;
  verificationEvidence: Evidence[];
  messages: PhaseMessage[];
  isLocked: boolean;
}

export interface TransitionResponse {
  workflow: WorkflowApiState;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface WorkflowApiService {
  getWorkflow(
    workflowId: string,
    signal?: AbortSignal,
  ): Promise<WorkflowApiState>;
  createWorkflow(
    agentId: string,
    conversationId?: string,
    signal?: AbortSignal,
  ): Promise<WorkflowApiState>;
  transition(
    workflowId: string,
    state: WorkflowApiStatePayload,
    signal?: AbortSignal,
  ): Promise<TransitionResponse>;
  approve(
    workflowId: string,
    state: WorkflowApiStatePayload,
    signal?: AbortSignal,
  ): Promise<TransitionResponse>;
  rollback(
    workflowId: string,
    targetPhase: WorkflowPhase,
    signal?: AbortSignal,
  ): Promise<TransitionResponse>;
  forceAdvance(
    workflowId: string,
    signal?: AbortSignal,
  ): Promise<TransitionResponse>;
}

export function createWorkflowApiService(
  baseUrl: string,
  getToken: () => string | null,
): WorkflowApiService {
  async function request<T>(
    path: string,
    init: RequestInit = {},
    signal?: AbortSignal,
  ): Promise<T> {
    const token = getToken();
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
      signal,
    });

    if (!res.ok) {
      throw new Error(`Workflow API error: ${res.status} ${res.statusText}`);
    }

    return res.json() as Promise<T>;
  }

  return {
    approve(workflowId, state, signal) {
      return request<TransitionResponse>(
        `/api/agent-workflows/${workflowId}/approve`,
        { body: JSON.stringify(state), method: 'POST' },
        signal,
      );
    },

    createWorkflow(agentId, conversationId, signal) {
      return request<WorkflowApiState>(
        '/api/agent-workflows',
        {
          body: JSON.stringify({
            agentId,
            linkedConversationId: conversationId,
          }),
          method: 'POST',
        },
        signal,
      );
    },

    forceAdvance(workflowId, signal) {
      return request<TransitionResponse>(
        `/api/agent-workflows/${workflowId}/force-advance`,
        { method: 'POST' },
        signal,
      );
    },
    getWorkflow(workflowId, signal) {
      return request<WorkflowApiState>(
        `/api/agent-workflows/${workflowId}`,
        {},
        signal,
      );
    },

    rollback(workflowId, targetPhase, signal) {
      return request<TransitionResponse>(
        `/api/agent-workflows/${workflowId}/rollback`,
        { body: JSON.stringify({ targetPhase }), method: 'POST' },
        signal,
      );
    },

    transition(workflowId, state, signal) {
      return request<TransitionResponse>(
        `/api/agent-workflows/${workflowId}/transition`,
        { body: JSON.stringify(state), method: 'POST' },
        signal,
      );
    },
  };
}

/**
 * Map API state to local AgentWorkflowState for hydration.
 */
export function mapApiStateToLocal(api: WorkflowApiState): AgentWorkflowState {
  return {
    approaches: api.approaches,
    isLocked: api.isLocked,
    messages: api.messages.map((message) => ({
      ...message,
      timestamp:
        typeof message.timestamp === 'number'
          ? message.timestamp
          : new Date(message.timestamp).getTime(),
    })),
    phase: api.currentPhase,
    questions: api.questions,
    selectedApproachId: api.selectedApproachId,
    transitions: api.phaseHistory.map((entry, i) => ({
      actor: entry.actor,
      from: entry.from,
      id: `api-${entry.timestamp}-${entry.from}-${entry.to}-${i}`,
      timestamp: new Date(entry.timestamp).getTime(),
      to: entry.to,
      trigger: entry.trigger,
    })),
    verificationEvidence: api.verificationEvidence,
  };
}
