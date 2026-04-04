import { create } from 'zustand';
import {
  createInitialState,
  getNextPhase,
  isGateMet,
  isValidRollback,
} from './machine';
import type {
  Actor,
  AgentWorkflowState,
  AgentWorkflowStore,
  Approach,
  Evidence,
  PhaseTransition,
  Question,
  WorkflowPhase,
} from './types';
import type {
  WorkflowApiService,
  WorkflowApiStatePayload,
} from './workflow-api.service';
import { mapApiStateToLocal } from './workflow-api.service';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createTransition(
  from: WorkflowPhase,
  to: WorkflowPhase,
  trigger: PhaseTransition['trigger'],
  actor: Actor,
): PhaseTransition {
  return {
    actor,
    from,
    id: generateId(),
    timestamp: Date.now(),
    to,
    trigger,
  };
}

function buildApiStatePayload(
  state: Pick<
    AgentWorkflowState,
    | 'questions'
    | 'approaches'
    | 'selectedApproachId'
    | 'verificationEvidence'
    | 'messages'
    | 'isLocked'
  >,
): WorkflowApiStatePayload {
  return {
    approaches: state.approaches,
    isLocked: state.isLocked,
    messages: state.messages,
    questions: state.questions,
    selectedApproachId: state.selectedApproachId,
    verificationEvidence: state.verificationEvidence,
  };
}

// ---------------------------------------------------------------------------
// Extended store state with optional API binding
// ---------------------------------------------------------------------------

interface ApiBinding {
  workflowId: string;
  apiService: WorkflowApiService;
}

interface AgentWorkflowStoreExtended extends AgentWorkflowStore {
  /** Bind to a remote workflow. Once bound, phase transitions call the API. */
  bindApi: (
    workflowId: string,
    apiService: WorkflowApiService,
  ) => Promise<void>;
  /** Current API binding, if any. */
  apiBinding: ApiBinding | null;
}

export const useAgentWorkflowStore = create<AgentWorkflowStoreExtended>(
  (set, get) => ({
    ...createInitialState(),

    // =========================================================================
    // Proposing phase
    // =========================================================================

    addApproach: (approach) => {
      const a: Approach = { ...approach, id: generateId() };
      set((state) => ({
        approaches: [...state.approaches, a],
      }));
    },

    // =========================================================================
    // Verification phase
    // =========================================================================

    addEvidence: (evidence) => {
      const e: Evidence = { ...evidence, id: generateId() };
      set((state) => ({
        verificationEvidence: [...state.verificationEvidence, e],
      }));
    },

    // =========================================================================
    // Messages
    // =========================================================================

    addMessage: (role, content) => {
      const state = get();
      set({
        messages: [
          ...state.messages,
          {
            content,
            id: generateId(),
            phase: state.phase,
            role,
            timestamp: Date.now(),
          },
        ],
      });
    },

    // =========================================================================
    // Clarifying phase
    // =========================================================================

    addQuestion: (question) => {
      const q: Question = { ...question, id: generateId() };
      set((state) => ({
        questions: [...state.questions, q],
      }));
    },

    // =========================================================================
    // Phase transitions (with optimistic update + server reconciliation)
    // =========================================================================

    advance: (actor) => {
      const state = get();
      if (!isGateMet(state)) return false;

      const next = getNextPhase(state.phase);
      if (!next) return false;

      // Optimistic local update
      set({
        phase: next,
        transitions: [
          ...state.transitions,
          createTransition(state.phase, next, 'gate_met', actor),
        ],
      });

      // Fire API call if bound (reconcile on response)
      const binding = state.apiBinding;
      if (binding) {
        binding.apiService
          .transition(binding.workflowId, buildApiStatePayload(state))
          .then((res) => {
            const reconciled = mapApiStateToLocal(res.workflow);
            set(reconciled);
          })
          .catch(() => {
            // Rollback optimistic update on failure
            set({ phase: state.phase, transitions: state.transitions });
          });
      }

      return true;
    },

    answerQuestion: (questionId, answer) => {
      set((state) => ({
        questions: state.questions.map((q) =>
          q.id === questionId ? { ...q, answer } : q,
        ),
      }));
    },
    apiBinding: null,

    approveApproach: () => {
      const state = get();
      if (state.phase !== 'awaiting_approval') return false;
      if (!state.selectedApproachId) return false;

      const binding = state.apiBinding;
      if (binding) {
        const next = getNextPhase(state.phase);
        if (!next) return false;

        set({
          phase: next,
          transitions: [
            ...state.transitions,
            createTransition(state.phase, next, 'gate_met', 'user'),
          ],
        });

        binding.apiService
          .approve(binding.workflowId, buildApiStatePayload(state))
          .then((res) => {
            const reconciled = mapApiStateToLocal(res.workflow);
            set(reconciled);
          })
          .catch(() => {
            set({
              phase: state.phase,
              transitions: state.transitions,
            });
          });

        return true;
      }

      return get().advance('user');
    },

    // =========================================================================
    // API binding
    // =========================================================================

    bindApi: async (workflowId, apiService) => {
      const apiState = await apiService.getWorkflow(workflowId);
      const local = mapApiStateToLocal(apiState);
      set({
        ...local,
        apiBinding: { apiService, workflowId },
      });
    },

    // =========================================================================
    // Queries
    // =========================================================================

    canAdvance: () => {
      return isGateMet(get());
    },

    forceAdvance: () => {
      const state = get();
      const next = getNextPhase(state.phase);
      if (!next || state.isLocked) return false;

      set({
        phase: next,
        transitions: [
          ...state.transitions,
          createTransition(state.phase, next, 'force_advance', 'user'),
        ],
      });

      const binding = state.apiBinding;
      if (binding) {
        binding.apiService
          .forceAdvance(binding.workflowId)
          .then((res) => {
            const reconciled = mapApiStateToLocal(res.workflow);
            set(reconciled);
          })
          .catch(() => {
            set({ phase: state.phase, transitions: state.transitions });
          });
      }

      return true;
    },

    getAllEvidencePassed: () => {
      const evidence = get().verificationEvidence;
      return evidence.length > 0 && evidence.every((e) => e.passed);
    },

    getPhaseMessages: (phase) => {
      return get().messages.filter((m) => m.phase === phase);
    },

    getUnansweredQuestions: () => {
      return get().questions.filter(
        (q) => q.answer === undefined || q.answer === '',
      );
    },

    removeApproach: (approachId) => {
      set((state) => ({
        approaches: state.approaches.filter((a) => a.id !== approachId),
        selectedApproachId:
          state.selectedApproachId === approachId
            ? null
            : state.selectedApproachId,
      }));
    },

    removeEvidence: (evidenceId) => {
      set((state) => ({
        verificationEvidence: state.verificationEvidence.filter(
          (e) => e.id !== evidenceId,
        ),
      }));
    },

    reset: () => {
      set({ ...createInitialState(), apiBinding: get().apiBinding });
    },

    rollback: (targetPhase) => {
      const state = get();
      if (state.isLocked) return false;
      if (!isValidRollback(state.phase, targetPhase)) return false;

      set({
        phase: targetPhase,
        transitions: [
          ...state.transitions,
          createTransition(state.phase, targetPhase, 'rollback', 'user'),
        ],
      });

      const binding = state.apiBinding;
      if (binding) {
        binding.apiService
          .rollback(binding.workflowId, targetPhase)
          .then((res) => {
            const reconciled = mapApiStateToLocal(res.workflow);
            set(reconciled);
          })
          .catch(() => {
            set({ phase: state.phase, transitions: state.transitions });
          });
      }

      return true;
    },

    // =========================================================================
    // Approval phase
    // =========================================================================

    selectApproach: (approachId) => {
      const state = get();
      const exists = state.approaches.some((a) => a.id === approachId);
      if (!exists) return;
      set({ selectedApproachId: approachId });
    },

    // =========================================================================
    // Locking
    // =========================================================================

    setLocked: (locked) => {
      set({ isLocked: locked });
    },
  }),
);
