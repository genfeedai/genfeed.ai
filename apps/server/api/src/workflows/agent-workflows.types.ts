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

export type AgentWorkflowTrigger = 'gate_met' | 'force_advance' | 'rollback';
export type AgentWorkflowActor = 'user' | 'agent';

export interface AgentWorkflowQuestion {
  id: string;
  text: string;
  type: 'multiple_choice' | 'free_text';
  options?: string[];
  answer?: string;
}

export interface AgentWorkflowApproach {
  id: string;
  title: string;
  description: string;
  recommended: boolean;
  tradeoffs: {
    pros: string[];
    cons: string[];
  };
}

export interface AgentWorkflowEvidence {
  id: string;
  type: 'test_result' | 'screenshot' | 'log' | 'diff';
  title: string;
  content: string;
  passed: boolean;
}

export interface AgentWorkflowMessage {
  id: string;
  phase: AgentWorkflowPhase;
  role: AgentWorkflowActor;
  content: string;
  timestamp: number;
}

export interface AgentWorkflowPhaseHistoryEntry {
  from: AgentWorkflowPhase;
  to: AgentWorkflowPhase;
  trigger: AgentWorkflowTrigger;
  actor: AgentWorkflowActor;
  timestamp: Date;
}

export interface AgentWorkflowStateSnapshot {
  questions: AgentWorkflowQuestion[];
  approaches: AgentWorkflowApproach[];
  selectedApproachId: string | null;
  verificationEvidence: AgentWorkflowEvidence[];
  messages: AgentWorkflowMessage[];
  isLocked: boolean;
}

export interface AgentWorkflowDocumentShape extends AgentWorkflowStateSnapshot {
  currentPhase: AgentWorkflowPhase;
}

export type AgentWorkflowGateStatus = Record<AgentWorkflowPhase, boolean>;
