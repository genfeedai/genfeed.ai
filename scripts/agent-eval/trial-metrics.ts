import type {
  AgentTask,
  AgentTrace,
  TaskSummary,
  TrialResult,
} from './trial-contracts';

export function scoreTrial(
  task: AgentTask,
  trace: AgentTrace,
  variantId: string,
  attempt: number,
): TrialResult {
  const constraints = Object.fromEntries(
    task.constraints.map((constraint) => [
      constraint.id,
      constraint.check(trace, task.scope),
    ]),
  );
  return {
    attempt,
    constraints,
    cost: trace.cost,
    durationMs: trace.durationMs,
    reward: Object.values(constraints).every(Boolean) ? 1 : 0,
    steps: trace.toolCalls.length,
    taskId: task.id,
    variantId,
  };
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Summarise the trials of one task and one variant. `k` is the number of
 * consecutive attempts the reliability claim is about. pass@k and pass^k use
 * the plug-in success rate, so below k trials they are null rather than a
 * number that reads as evidence.
 */
export function summarizeTask(
  results: readonly TrialResult[],
  k: number,
): TaskSummary {
  const [first] = results;
  if (!first) throw new Error('Cannot summarise zero trials');
  const sameCell = results.every(
    (result) =>
      result.taskId === first.taskId && result.variantId === first.variantId,
  );
  if (!sameCell) {
    throw new Error('Summarise one task and one variant at a time');
  }
  const successes = results.filter((result) => result.reward === 1);
  const successRate = successes.length / results.length;
  const hasEnoughTrials = results.length >= k;
  const failedConstraints: Record<string, number> = {};
  for (const result of results) {
    for (const [id, isMet] of Object.entries(result.constraints)) {
      if (!isMet) failedConstraints[id] = (failedConstraints[id] ?? 0) + 1;
    }
  }
  return {
    failedConstraints,
    meanCostPerSuccess:
      successes.length === 0
        ? null
        : results.reduce((sum, result) => sum + result.cost, 0) /
          successes.length,
    meanStepsOnSuccess: mean(successes.map((result) => result.steps)),
    passAtK: hasEnoughTrials ? 1 - (1 - successRate) ** k : null,
    passHatK: hasEnoughTrials ? successRate ** k : null,
    successRate,
    successes: successes.length,
    taskId: first.taskId,
    trials: results.length,
    variantId: first.variantId,
  };
}
