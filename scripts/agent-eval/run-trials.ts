import { execFileSync } from 'node:child_process';
import type { AgentVariant } from './trial-contracts';
import { runTrials, validateTaskSet } from './trial-runner';
import { AGENT_TRIAL_TASKS } from './trial-tasks';

const ATTEMPTS = 5;
const REFERENCE_VARIANT: AgentVariant = {
  id: 'reference-trace',
  run: async (task) => task.reference,
};

const errors = validateTaskSet(AGENT_TRIAL_TASKS);
if (errors.length > 0) {
  process.stderr.write(`${errors.join('\n')}\n`);
  process.exitCode = 1;
} else {
  const { results, summaries } = await runTrials({
    attempts: ATTEMPTS,
    k: ATTEMPTS,
    tasks: AGENT_TRIAL_TASKS,
    variants: [REFERENCE_VARIANT],
  });
  const report = {
    schemaVersion: 1,
    evidenceKind: 'deterministic-trial-evaluation',
    sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
    generatedAt: new Date().toISOString(),
    provider: 'none',
    model: 'none',
    limitation:
      'Scores the reference traces. No model ran, so this shows the task set can be solved and the verifiers can fail. It says nothing about agent quality or reliability.',
    modelQualityAssessed: false,
    attempts: ATTEMPTS,
    summaries,
    results,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (summaries.some((summary) => summary.successRate !== 1)) {
    process.exitCode = 1;
  }
}
