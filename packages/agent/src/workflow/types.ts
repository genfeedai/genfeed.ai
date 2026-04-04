// =============================================================================
// WORKFLOW PHASES
// =============================================================================

export const WORKFLOW_PHASES = [
  'exploring',
  'clarifying',
  'proposing',
  'awaiting_approval',
  'implementing',
  'verifying',
  'complete',
] as const;

export type WorkflowPhase = (typeof WORKFLOW_PHASES)[number];

export const PHASE_LABELS: Record<WorkflowPhase, string> = {
  awaiting_approval: 'Approve',
  clarifying: 'Clarify',
  complete: 'Complete',
  exploring: 'Explore',
  implementing: 'Implement',
  proposing: 'Propose',
  verifying: 'Verify',
};

// =============================================================================
// GATE CONDITIONS
// =============================================================================

export type GateTrigger = 'gate_met' | 'force_advance' | 'rollback';
export type Actor = 'user' | 'agent';

export interface PhaseTransition {
  id: string;
  from: WorkflowPhase;
  to: WorkflowPhase;
  timestamp: number;
  trigger: GateTrigger;
  actor: Actor;
}

// =============================================================================
// CLARIFYING PHASE
// =============================================================================

export type QuestionType = 'multiple_choice' | 'free_text';

export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  options?: string[];
  answer?: string;
}

// =============================================================================
// PROPOSING PHASE
// =============================================================================

export interface ApproachTradeoffs {
  pros: string[];
  cons: string[];
}

export interface Approach {
  id: string;
  title: string;
  description: string;
  tradeoffs: ApproachTradeoffs;
  recommended: boolean;
}

// =============================================================================
// VERIFICATION PHASE
// =============================================================================

export type EvidenceType = 'test_result' | 'screenshot' | 'log' | 'diff';

export interface Evidence {
  id: string;
  type: EvidenceType;
  title: string;
  content: string;
  passed: boolean;
}

// =============================================================================
// MESSAGES
// =============================================================================

export interface PhaseMessage {
  id: string;
  phase: WorkflowPhase;
  role: Actor;
  content: string;
  timestamp: number;
}

// =============================================================================
// STATE
// =============================================================================

export interface AgentWorkflowState {
  phase: WorkflowPhase;
  transitions: PhaseTransition[];
  questions: Question[];
  approaches: Approach[];
  selectedApproachId: string | null;
  verificationEvidence: Evidence[];
  messages: PhaseMessage[];
  isLocked: boolean;
}

// =============================================================================
// ACTIONS
// =============================================================================

export interface AgentWorkflowActions {
  // Phase transitions
  advance: (actor: Actor) => boolean;
  forceAdvance: () => boolean;
  rollback: (targetPhase: WorkflowPhase) => boolean;
  reset: () => void;

  // Clarifying phase
  addQuestion: (question: Omit<Question, 'id'>) => void;
  answerQuestion: (questionId: string, answer: string) => void;

  // Proposing phase
  addApproach: (approach: Omit<Approach, 'id'>) => void;
  removeApproach: (approachId: string) => void;

  // Approval phase
  selectApproach: (approachId: string) => void;
  approveApproach: () => boolean;

  // Verification phase
  addEvidence: (evidence: Omit<Evidence, 'id'>) => void;
  removeEvidence: (evidenceId: string) => void;

  // Messages
  addMessage: (role: Actor, content: string) => void;

  // Locking
  setLocked: (locked: boolean) => void;

  // Queries
  canAdvance: () => boolean;
  getPhaseMessages: (phase: WorkflowPhase) => PhaseMessage[];
  getUnansweredQuestions: () => Question[];
  getAllEvidencePassed: () => boolean;
}

export type AgentWorkflowStore = AgentWorkflowState & AgentWorkflowActions;
