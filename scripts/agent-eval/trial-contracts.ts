import type { CuratedActionSurface } from '@eval-actions/registry/curated-action-catalog';

export type TaskKind = 'common' | 'edge' | 'must-not-act';

export interface AgentToolCall {
  args: Record<string, unknown>;
  hasTrustedApproval: boolean;
  name: string;
}

/** What one attempt did: the tool calls it made and the answer it gave. */
export interface AgentTrace {
  /** Credits the attempt spent, failed or not. */
  cost: number;
  durationMs: number;
  finalMessage: string;
  toolCalls: readonly AgentToolCall[];
}

export interface TaskScope {
  brandId: string;
  organizationId: string;
  surface: CuratedActionSurface;
}

export interface TaskConstraint {
  check: (trace: AgentTrace, scope: TaskScope) => boolean;
  description: string;
  id: string;
}

export interface ConstraintViolation {
  /** The constraint this trace must fail. */
  constraintId: string;
  trace: AgentTrace;
}

export interface AgentTask {
  constraints: readonly TaskConstraint[];
  id: string;
  instruction: string;
  kind: TaskKind;
  /** A trace that satisfies every constraint, proving the task is solvable. */
  reference: AgentTrace;
  scope: TaskScope;
  /** Traces that break one constraint each, proving the verifier can fail. */
  violations: readonly ConstraintViolation[];
}

/** Runs one attempt of a task. A live runner drives the real agent loop. */
export type AgentRunner = (
  task: AgentTask,
  attempt: number,
) => Promise<AgentTrace>;

export interface AgentVariant {
  id: string;
  run: AgentRunner;
}

export interface TrialResult {
  attempt: number;
  /** One binary score per constraint id. */
  constraints: Record<string, boolean>;
  cost: number;
  durationMs: number;
  /** 1 only when every constraint holds. */
  reward: 0 | 1;
  steps: number;
  taskId: string;
  variantId: string;
}

export interface TaskSummary {
  /** Failed trial count per constraint id. */
  failedConstraints: Record<string, number>;
  /** Credits over all trials divided by successes; null with no success. */
  meanCostPerSuccess: number | null;
  /** Mean tool calls over successful trials only; null with no success. */
  meanStepsOnSuccess: number | null;
  /** 1 - (1 - rate)^k; null while trials < k. */
  passAtK: number | null;
  /** rate^k; null while trials < k. */
  passHatK: number | null;
  successRate: number;
  successes: number;
  taskId: string;
  trials: number;
  variantId: string;
}
