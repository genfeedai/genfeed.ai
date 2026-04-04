export const AGENT_WORKFLOW_PHASES = [
  'exploring',
  'clarifying',
  'proposing',
  'awaiting_approval',
  'implementing',
  'verifying',
  'complete',
] as const;

export type AgentWorkflowPhase = (typeof AGENT_WORKFLOW_PHASES)[number];

export interface AgentWorkflowPhaseHistoryEntry {
  from: AgentWorkflowPhase;
  to: AgentWorkflowPhase;
  trigger: 'gate_met' | 'force_advance' | 'rollback';
  actor: 'user' | 'agent';
  timestamp: string;
}

export class AgentWorkflow {
  id = '';
  agentId = '';
  currentPhase: AgentWorkflowPhase = 'exploring';
  gateStatus: Record<AgentWorkflowPhase, boolean> = {
    awaiting_approval: false,
    clarifying: false,
    complete: false,
    exploring: true,
    implementing: true,
    proposing: false,
    verifying: false,
  };
  phaseHistory: AgentWorkflowPhaseHistoryEntry[] = [];
  linkedConversationId: string | null = null;

  constructor(partial: Partial<AgentWorkflow> = {}) {
    Object.assign(this, partial);
    this.phaseHistory = partial.phaseHistory ?? [];
    this.gateStatus = partial.gateStatus ?? this.gateStatus;
  }
}
