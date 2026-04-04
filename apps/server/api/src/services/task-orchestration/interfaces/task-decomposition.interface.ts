import type { AgentType } from '@genfeedai/enums';

/**
 * A single subtask produced by the decomposition LLM.
 * Each maps to one agent run.
 */
export interface DecomposedSubtask {
  /** Agent type to handle this subtask */
  agentType: AgentType;
  /** Clear brief for the agent (injected as its objective) */
  brief: string;
  /** Ordering index — lower runs first; same index = parallel */
  order: number;
  /** Human-readable label for the run (shown in UI) */
  label: string;
}

/**
 * Full decomposition result from the routing LLM.
 */
export interface TaskDecompositionResult {
  /** Subtasks to execute */
  subtasks: DecomposedSubtask[];
  /** LLM-generated routing summary (shown to user) */
  routingSummary: string;
  /** Whether the task can be handled by a single agent */
  isSingleAgent: boolean;
}

/**
 * Input context for the decomposition LLM.
 */
export interface TaskDecompositionInput {
  /** The user's natural-language request */
  request: string;
  /** Optional output type hint from the user */
  outputType?: string;
  /** Target platforms */
  platforms?: string[];
  /** Brand name for context (if available) */
  brandName?: string;
}
