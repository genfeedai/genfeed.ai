// Components
export { AgentWorkflow } from './components/AgentWorkflow';
export { ApproachCard } from './components/ApproachCard';
export { ApprovalPanel } from './components/ApprovalPanel';
export { PhaseConversation } from './components/PhaseConversation';
export { PhaseProgress } from './components/PhaseProgress';
export { PhaseTransitionLog } from './components/PhaseTransitionLog';
export { QuestionCard } from './components/QuestionCard';
export { VerificationPanel } from './components/VerificationPanel';

// Hooks
export { useAgentWorkflow } from './hooks/useAgentWorkflow';
// Machine (pure functions)
export {
  createInitialState,
  getNextPhase,
  getPhaseIndex,
  isGateMet,
  isValidRollback,
} from './machine';
// Store
export { useAgentWorkflowStore } from './store';
export type {
  Actor,
  AgentWorkflowActions,
  AgentWorkflowState,
  AgentWorkflowStore,
  Approach,
  ApproachTradeoffs,
  Evidence,
  EvidenceType,
  GateTrigger,
  PhaseMessage,
  PhaseTransition,
  Question,
  QuestionType,
  WorkflowPhase,
} from './types';
// Types
export { PHASE_LABELS, WORKFLOW_PHASES } from './types';
export type {
  TransitionResponse,
  WorkflowApiService,
  WorkflowApiState,
  WorkflowApiStatePayload,
} from './workflow-api.service';
// API service
export {
  createWorkflowApiService,
  mapApiStateToLocal,
} from './workflow-api.service';
