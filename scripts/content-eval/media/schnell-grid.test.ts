import {
  SCHNELL_ABLATION_MODEL_KEY,
  SCHNELL_ABLATION_SCENARIOS,
} from '@api/services/generation-brief/schnell-live-ablation';
import { describe, expect, it } from 'vitest';
import type {
  AnswerDimensions,
  MediaContestant,
  MediaLadderSection,
} from './contracts';
import {
  buildHumanAnchorSheet,
  buildSchnellGridTasks,
  summarizeSchnellGrid,
} from './schnell-grid';

function contestant(isCompiled: boolean): MediaContestant {
  return {
    contestant: {
      addedAt: '2026-09-26T00:00:00.000Z',
      id: isCompiled ? 'genfeed-compiled.schnell' : 'bfl.schnell',
      isCompiled,
      label: 'Schnell',
      mediums: ['image'],
      modelId: SCHNELL_ABLATION_MODEL_KEY,
      provider: isCompiled ? 'genfeed' : 'black-forest-labs',
      retiredAt: null,
    },
    creditsPerOutput: 1,
    family: 'black-forest-labs',
    registryKey: SCHNELL_ABLATION_MODEL_KEY,
    route: isCompiled
      ? {
          compilerId: 'flux-schnell',
          compilerVersion: 1,
          fidelityMode: 'guided',
          kind: 'compiled',
          profileId: 'flux-schnell',
          profileVersion: 1,
        }
      : { kind: 'raw' },
  };
}

const LEGACY = contestant(false);
const COMPILED = contestant(true);

function dims(adherence: number, brandFit: number | null): AnswerDimensions {
  return {
    adherence: [
      { line: 0, yesProbability: adherence },
      { line: 1, yesProbability: adherence },
      { line: 2, yesProbability: adherence },
    ],
    brandFit,
    craft: 0.5,
  };
}

/**
 * Guided rows: compiled on-brand, legacy off-brand. Unbranded rows: both
 * adhere. The judged lift is 100 pp and there is no regression.
 */
function section(): MediaLadderSection {
  const answers = SCHNELL_ABLATION_SCENARIOS.flatMap((scenario) =>
    [LEGACY, COMPILED].map((arm) => ({
      answer: {
        artifactUrl: `genfeed-ingredient://${scenario.id}-${arm.contestant.id}`,
        contestantId: arm.contestant.id,
        seed: scenario.seed,
        settings: {},
      },
      callIds: [],
      contestantId: arm.contestant.id,
      costCredits: 1,
      ingredientId: `${scenario.id}-${arm.contestant.id}`,
      latencyMs: 1,
      readiness: {
        diagnostics: [],
        platform: 'instagram',
        status: 'ready' as const,
      },
      requestPromptDigest: 'x',
      taskId: scenario.id,
      voidDetail: null,
      voidReason: null,
    })),
  );
  const answerOf = (taskId: string, arm: MediaContestant) => {
    const row = answers.find(
      (answer) =>
        answer.taskId === taskId && answer.contestantId === arm.contestant.id,
    );
    if (!row) throw new Error(`missing answer ${taskId}`);
    return row.answer;
  };
  const matches = SCHNELL_ABLATION_SCENARIOS.map((scenario) => {
    const isGuided = scenario.cohort === 'guided';
    const vote = {
      callId: null,
      costUsd: 0,
      dimensions: {
        a: dims(0.9, isGuided ? 0.8 : null),
        b: dims(0.9, isGuided ? 0.1 : null),
      },
      error: null,
      judgeFamily: 'anthropic',
      latencyMs: 1,
      rawChoice: isGuided ? ('a' as const) : ('tie' as const),
      vote: {
        choice: isGuided ? ('a' as const) : ('void' as const),
        judgeModelId: 'anthropic/claude-sonnet-5',
        rationale: 'r',
      },
    };
    return {
      match: {
        a: answerOf(scenario.id, COMPILED),
        b: answerOf(scenario.id, LEGACY),
        id: `grid:${scenario.id}`,
        ratingChange: null,
        recordedAt: null,
        seasonId: 'internal-3470-schnell-grid',
        state: isGuided ? ('recorded' as const) : ('void' as const),
        taskId: scenario.id,
        taskVersion: 1,
        verdict: isGuided ? ('a' as const) : ('void' as const),
        votes: [vote.vote, vote.vote, vote.vote],
      },
      medium: 'image' as const,
      voidDetail: null,
      voidReason: isGuided ? null : ('panel-tie' as const),
      votes: [vote, vote, vote],
    };
  });
  return {
    answers,
    benchRevision: 'r',
    calibration: { isDecisionGrade: false, reason: 'x', reportRef: null },
    contestants: [LEGACY, COMPILED],
    isAborted: false,
    isPublicLadderEligible: false,
    judges: [],
    ladder: [],
    matches,
    medium: 'image',
    rubricVersion: 'media-panel-v1',
    schemaVersion: 1,
    seasonId: 'internal-3470-schnell-grid',
    seed: 1,
    taskWinRates: [],
    tasks: [],
    technicalDims: { reason: 'x', source: 'absent' },
  };
}

describe('Schnell grid (#3470 re-score)', () => {
  it('replays the 12 scenarios with their recorded seeds and cohort fidelity', () => {
    const tasks = buildSchnellGridTasks();
    expect(tasks).toHaveLength(12);
    for (const scenario of SCHNELL_ABLATION_SCENARIOS) {
      const task = tasks.find((row) => row.task.id === scenario.id);
      expect(task).toMatchObject({
        compiledFidelity: scenario.fidelityMode,
        fixedSeed: scenario.seed,
      });
      expect(task?.style !== null).toBe(scenario.cohort === 'guided');
    }
  });

  it('derives pass rates and both #3470 deltas from judged dimensions', () => {
    const summary = summarizeSchnellGrid(section(), LEGACY, COMPILED, []);
    expect(summary.guided).toMatchObject({
      compiledPassRate: 1,
      compiledWinRate: 1,
      legacyPassRate: 0,
      liftPercentagePoints: 100,
      meetsLift: true,
    });
    expect(summary.unbranded).toMatchObject({
      meetsRegressionLimit: true,
      regressionPercentagePoints: 0,
    });
    expect(summary.compiledArmUsesPromptEnhancement).toBe(true);
    expect(summary.humanAnchors.isSufficient).toBe(false);
  });

  it('builds an anchor sheet and scores judge-human agreement once rated', () => {
    const grid = section();
    const sheet = buildHumanAnchorSheet(grid);
    expect(sheet).toHaveLength(12);
    const rated = sheet.map((anchor) => ({
      ...anchor,
      humanChoice:
        anchor.cohort === 'guided' ? ('a' as const) : ('tie' as const),
    }));
    const summary = summarizeSchnellGrid(grid, LEGACY, COMPILED, rated);
    expect(summary.humanAnchors).toMatchObject({
      agreement: 1,
      guidedRated: 6,
      isSufficient: true,
      unbrandedRated: 6,
    });
  });
});
