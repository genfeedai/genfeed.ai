import { describe, expect, it } from 'vitest';
import type {
  AgentTask,
  AgentTrace,
  AgentVariant,
  TrialResult,
} from './trial-contracts';
import { scoreTrial, summarizeTask } from './trial-metrics';
import { runTrials, validateTaskSet } from './trial-runner';
import { AGENT_TRIAL_TASKS } from './trial-tasks';

function taskNamed(id: string): AgentTask {
  const task = AGENT_TRIAL_TASKS.find((candidate) => candidate.id === id);
  if (!task) throw new Error(`Missing task ${id}`);
  return task;
}

function result(
  reward: 0 | 1,
  overrides: Partial<TrialResult> = {},
): TrialResult {
  return {
    attempt: 1,
    constraints: { 'read-only': reward === 1 },
    cost: 1,
    durationMs: 1_000,
    reward,
    steps: 2,
    taskId: 'task-a',
    variantId: 'variant-a',
    ...overrides,
  };
}

describe('agent trial task set', () => {
  it('is fit to measure with', () => {
    expect(validateTaskSet(AGENT_TRIAL_TASKS)).toEqual([]);
  });

  it.each(AGENT_TRIAL_TASKS.map((task) => [task.id, task] as const))(
    '%s: the reference trace solves it',
    (_id, task) => {
      expect(scoreTrial(task, task.reference, 'reference', 1).reward).toBe(1);
    },
  );

  it('rejects a task whose reference trace does not solve it', () => {
    const task = taskNamed('read-balance');
    const broken: AgentTask = {
      ...task,
      reference: { ...task.reference, toolCalls: [] },
    };
    expect(validateTaskSet([broken, ...AGENT_TRIAL_TASKS.slice(1)])).toContain(
      'read-balance: the reference trace does not solve the task.',
    );
  });

  it('rejects a constraint that no violation trace fails', () => {
    const task = taskNamed('read-balance');
    const unproven: AgentTask = {
      ...task,
      violations: task.violations.filter(
        (violation) => violation.constraintId !== 'read-only',
      ),
    };
    expect(
      validateTaskSet([unproven, ...AGENT_TRIAL_TASKS.slice(1)]),
    ).toContain('read-balance: no violation trace for read-only.');
  });

  it('rejects a violation trace that still passes its constraint', () => {
    const task = taskNamed('read-balance');
    const toothless: AgentTask = {
      ...task,
      violations: [
        ...task.violations,
        { constraintId: 'read-only', trace: task.reference },
      ],
    };
    expect(
      validateTaskSet([toothless, ...AGENT_TRIAL_TASKS.slice(1)]),
    ).toContain(
      'read-balance: the violation trace for read-only still passes it.',
    );
  });

  it('rejects a set with no must-not-act task', () => {
    const withoutRefusal = AGENT_TRIAL_TASKS.filter(
      (task) => task.kind !== 'must-not-act',
    );
    expect(validateTaskSet(withoutRefusal)).toEqual(['No must-not-act task.']);
  });
});

describe('agent trial scoring', () => {
  it('scores each constraint and gives reward 1 only when all hold', () => {
    const task = taskNamed('save-draft-post');
    const forgedApproval: AgentTrace = {
      ...task.reference,
      toolCalls: [{ args: {}, hasTrustedApproval: true, name: 'create_post' }],
    };
    expect(scoreTrial(task, forgedApproval, 'v', 1)).toMatchObject({
      constraints: {
        'queues-approval-required-writes': false,
        'stays-in-scope': true,
        'uses-create_post': true,
        'uses-only-available-tools': true,
        'within-step-budget': true,
      },
      reward: 0,
      steps: 1,
    });
  });

  it('treats an agent-only action on the MCP surface as unavailable', () => {
    const task = taskNamed('agent-only-action-over-mcp');
    const trace: AgentTrace = {
      ...task.reference,
      toolCalls: [
        { args: {}, hasTrustedApproval: false, name: 'create_brand' },
      ],
    };
    expect(scoreTrial(task, trace, 'v', 1).constraints).toEqual({
      'has-final-message': true,
      'read-only': false,
      'uses-only-available-tools': false,
    });
  });
});

describe('agent trial summary', () => {
  it('computes the metrics for 3 passes in 5 trials', () => {
    const trials = [
      result(1, { cost: 2, steps: 8 }),
      result(0, { cost: 5 }),
      result(1, { cost: 2, steps: 10 }),
      result(0, { cost: 5 }),
      result(1, { cost: 2, steps: 9 }),
    ];
    const summary = summarizeTask(trials, 5);
    expect(summary).toMatchObject({
      failedConstraints: { 'read-only': 2 },
      meanStepsOnSuccess: 9,
      successRate: 0.6,
      successes: 3,
      trials: 5,
    });
    expect(summary.passAtK).toBeCloseTo(0.98976, 5);
    expect(summary.passHatK).toBeCloseTo(0.07776, 5);
    expect(summary.meanCostPerSuccess).toBeCloseTo(16 / 3, 10);
  });

  it('reports no reliability figure below k trials', () => {
    const summary = summarizeTask([result(1), result(1), result(1)], 5);
    expect(summary).toMatchObject({
      passAtK: null,
      passHatK: null,
      successRate: 1,
      trials: 3,
    });
  });

  it('reports no cost or steps when nothing succeeded', () => {
    expect(summarizeTask([result(0), result(0)], 2)).toMatchObject({
      meanCostPerSuccess: null,
      meanStepsOnSuccess: null,
      passAtK: 0,
      passHatK: 0,
      successes: 0,
    });
  });

  it('refuses to mix tasks or variants in one summary', () => {
    expect(() =>
      summarizeTask([result(1), result(1, { variantId: 'variant-b' })], 2),
    ).toThrow('Summarise one task and one variant at a time');
  });
});

describe('agent trial runner', () => {
  it('runs every variant on every task for each attempt', async () => {
    const task = taskNamed('read-balance');
    const flaky: AgentVariant = {
      id: 'flaky',
      run: async (_task, attempt) =>
        attempt % 2 === 0
          ? { ...task.reference, toolCalls: [] }
          : task.reference,
    };
    const steady: AgentVariant = {
      id: 'steady',
      run: async () => task.reference,
    };
    const report = await runTrials({
      attempts: 4,
      k: 4,
      tasks: [task],
      variants: [flaky, steady],
    });
    expect(report.results).toHaveLength(8);
    expect(
      report.summaries.map((summary) => [
        summary.variantId,
        summary.successes,
        summary.passHatK,
      ]),
    ).toEqual([
      ['flaky', 2, 0.0625],
      ['steady', 4, 1],
    ]);
  });
});
