import type {
  AgentTask,
  AgentVariant,
  TaskSummary,
  TrialResult,
} from './trial-contracts';
import { scoreTrial, summarizeTask } from './trial-metrics';

export interface TrialRunReport {
  results: TrialResult[];
  summaries: TaskSummary[];
}

/** Problems that make a task set unfit to measure anything. Empty means fit. */
export function validateTaskSet(tasks: readonly AgentTask[]): string[] {
  const errors: string[] = [];
  const ids = tasks.map((task) => task.id);
  if (new Set(ids).size !== ids.length) errors.push('Task ids are not unique.');
  if (!tasks.some((task) => task.kind === 'common')) {
    errors.push('No common-case task.');
  }
  if (!tasks.some((task) => task.kind === 'edge')) {
    errors.push('No edge-case task.');
  }
  if (!tasks.some((task) => task.kind === 'must-not-act')) {
    errors.push('No must-not-act task.');
  }
  for (const task of tasks) {
    const constraintIds = task.constraints.map((constraint) => constraint.id);
    if (new Set(constraintIds).size !== constraintIds.length) {
      errors.push(`${task.id}: constraint ids are not unique.`);
    }
    const reference = scoreTrial(task, task.reference, 'reference', 0);
    if (reference.reward !== 1) {
      errors.push(`${task.id}: the reference trace does not solve the task.`);
    }
    for (const constraint of task.constraints) {
      const failing = task.violations.filter(
        (violation) => violation.constraintId === constraint.id,
      );
      if (failing.length === 0) {
        errors.push(`${task.id}: no violation trace for ${constraint.id}.`);
      }
      for (const violation of failing) {
        const result = scoreTrial(task, violation.trace, 'violation', 0);
        if (result.constraints[constraint.id] !== false) {
          errors.push(
            `${task.id}: the violation trace for ${constraint.id} still passes it.`,
          );
        }
      }
    }
    for (const violation of task.violations) {
      if (!task.constraints.some((c) => c.id === violation.constraintId)) {
        errors.push(
          `${task.id}: violation names unknown constraint ${violation.constraintId}.`,
        );
      }
    }
  }
  return errors;
}

/**
 * Run every variant on every task `attempts` times, one attempt after another
 * so a run is reproducible, and summarise each task and variant against `k`.
 */
export async function runTrials(input: {
  attempts: number;
  k: number;
  tasks: readonly AgentTask[];
  variants: readonly AgentVariant[];
}): Promise<TrialRunReport> {
  const results: TrialResult[] = [];
  const summaries: TaskSummary[] = [];
  for (const variant of input.variants) {
    for (const task of input.tasks) {
      const cell: TrialResult[] = [];
      for (let attempt = 1; attempt <= input.attempts; attempt += 1) {
        const trace = await variant.run(task, attempt);
        cell.push(scoreTrial(task, trace, variant.id, attempt));
      }
      results.push(...cell);
      summaries.push(summarizeTask(cell, input.k));
    }
  }
  return { results, summaries };
}
