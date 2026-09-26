import { describe, expect, it, vi } from 'vitest';
import { matchSchema } from '../bench/schema';
import { SpendCapExceededError } from '../spend';
import type {
  JudgeSpec,
  JudgeVerdict,
  MediaContestant,
  MediaLadderSection,
} from './contracts';
import type { MediaGenerationPort } from './generation';
import type { FrameSamplerPort, VisionJudgePort } from './judge';
import type { MediaProbePort } from './readiness';
import {
  InsufficientJudgePanelError,
  type MediaLadderDeps,
  type MediaLadderOptions,
  runMediaLadder,
} from './run-media-ladder';
import { loadBenchTasks, loadKelderBrandKit } from './tasks';

const JUDGES: JudgeSpec[] = [
  { family: 'anthropic', modelId: 'anthropic/claude-sonnet-5' },
  { family: 'xai', modelId: 'x-ai/grok-4.6' },
  { family: 'qwen', modelId: 'qwen/qwen3-vl' },
  { family: 'google', modelId: 'google/gemini-3-flash' },
];

function contestant(
  id: string,
  family: string,
  registryKey: string,
  isCompiled = false,
): MediaContestant {
  return {
    contestant: {
      addedAt: '2026-09-26T00:00:00.000Z',
      id,
      isCompiled,
      label: id,
      mediums: ['image'],
      modelId: registryKey,
      provider: isCompiled ? 'genfeed' : family,
      retiredAt: null,
    },
    creditsPerOutput: 2,
    family,
    registryKey,
    route: isCompiled
      ? {
          compilerId: 'c',
          compilerVersion: 1,
          fidelityMode: 'guided',
          kind: 'compiled',
          profileId: 'p',
          profileVersion: 1,
        }
      : { kind: 'raw' },
  };
}

const STRONG = contestant('openai.gpt-image-2', 'openai', 'openai/gpt-image-2');
const WEAK = contestant(
  'black-forest-labs.flux-schnell',
  'black-forest-labs',
  'black-forest-labs/flux-schnell',
);
const OFF_SPEC = contestant(
  'bytedance.seedream-5-pro',
  'bytedance',
  'bytedance/seedream-5-pro',
);

/** Quality per contestant; the stub judge prefers the higher one. */
const QUALITY: Record<string, number> = {
  [OFF_SPEC.contestant.id]: 0.5,
  [STRONG.contestant.id]: 0.9,
  [WEAK.contestant.id]: 0.3,
};

interface Harness {
  deps: MediaLadderDeps;
  generate: ReturnType<typeof vi.fn>;
  judgeCalls: string[][];
}

function harness(options: { spendCapAfter?: number } = {}): Harness {
  let reservations = 0;
  const judgeCalls: string[][] = [];
  const generate = vi.fn(
    async (
      request: Parameters<MediaGenerationPort['generate']>[0],
    ): ReturnType<MediaGenerationPort['generate']> => ({
      costEvidence: 'reported',
      creditsCharged: request.contestant.creditsPerOutput,
      error: null,
      fetchUrl: `https://cdn.example/${request.contestant.contestant.id}/${request.seed}/${request.width}x${request.height}.png`,
      ingredientId: `${request.contestant.contestant.id}-${request.seed}`,
      latencyMs: 10,
      settings: { model: request.contestant.registryKey },
      status: 'generated',
    }),
  );
  const probe: MediaProbePort = {
    probe: async (url) => {
      const isOffSpec = url.includes(OFF_SPEC.contestant.id);
      const [, width, height] = /\/(\d+)x(\d+)\.png$/.exec(url) ?? [];
      return {
        audioCodec: null,
        container: 'png',
        durationSeconds: null,
        frameRate: null,
        height: isOffSpec ? 1536 : Number(height),
        kind: 'image',
        probedAt: '2026-09-26T00:00:00.000Z',
        sizeBytes: 1000,
        videoCodec: null,
        width: isOffSpec ? 400 : Number(width),
      };
    },
  };
  const frames: FrameSamplerPort = { sample: async (url) => [url] };
  const judge: VisionJudgePort = {
    judge: async (request) => {
      const urls = (
        Array.isArray(request.messages[1]?.content)
          ? request.messages[1].content
          : []
      ).flatMap((part) =>
        part.type === 'image_url' ? [part.image_url.url] : [],
      );
      judgeCalls.push([request.judge.modelId, ...urls]);
      const [aUrl, bUrl] = urls;
      const quality = (url: string | undefined) =>
        QUALITY[Object.keys(QUALITY).find((id) => url?.includes(id)) ?? ''] ??
        0;
      const side = (value: number) => ({
        adherence: Array.from({ length: request.rubricLines }, (_, line) => ({
          line,
          yesProbability: value,
        })),
        brandFit: null,
        craft: value,
      });
      const verdict: JudgeVerdict = {
        a: side(quality(aUrl)),
        b: side(quality(bUrl)),
        choice: quality(aUrl) > quality(bUrl) ? 'a' : 'b',
        rationale: 'Line 0 decided it.',
      };
      return { callId: 'judge-call', costUsd: 0.001, latencyMs: 5, verdict };
    },
  };
  return {
    deps: {
      frames,
      generation: { generate },
      judge,
      now: () => new Date('2026-09-26T12:00:00.000Z'),
      probe,
      spend: {
        chargeGeneration: () => 'gen-call',
        reserveGeneration: () => {
          reservations += 1;
          if (
            options.spendCapAfter !== undefined &&
            reservations > options.spendCapAfter
          ) {
            throw new SpendCapExceededError(10, 10);
          }
        },
      },
    },
    generate,
    judgeCalls,
  };
}

async function options(
  contestants: MediaContestant[],
): Promise<MediaLadderOptions> {
  const tasks = (
    await loadBenchTasks({ includeDrafts: false, medium: 'image' })
  ).filter(({ task }) =>
    ['prompt-adherence', 'text-in-image', 'character-consistency'].includes(
      task.id,
    ),
  );
  return {
    brandIds: { kelder: 'brand-kelder', neutral: 'brand-neutral' },
    calibration: {
      isDecisionGrade: false,
      reason: 'vision judge κ not yet reported (#4924)',
      reportRef: null,
    },
    contestants,
    judges: JUDGES,
    kit: await loadKelderBrandKit(),
    medium: 'image',
    references: {},
    seasonId: 'internal-image',
    seed: 11,
    tasks,
  };
}

const BENCH_SECRET_PATTERNS = [
  /X-Amz-Signature=/i,
  /[?&]token=/i,
  /sk-[a-z0-9]{16,}/i,
  /Bearer\s+[A-Za-z0-9._-]{20,}/,
];

function assertBenchValidateRules(section: MediaLadderSection): void {
  const seen = new Set<string>();
  for (const { match } of section.matches) {
    matchSchema.parse(match);
    expect(seen.has(match.id)).toBe(false);
    seen.add(match.id);
    expect(match.a.contestantId).not.toBe(match.b.contestantId);
    if (match.state === 'void') expect(match.ratingChange).toBeNull();
    if (match.state === 'recorded') {
      expect(match.verdict).not.toBeNull();
      expect(match.votes.length).toBeGreaterThanOrEqual(3);
    }
  }
  const serialized = JSON.stringify(section.matches);
  for (const pattern of BENCH_SECRET_PATTERNS) {
    expect(serialized).not.toMatch(pattern);
  }
  expect(serialized).not.toContain('https://cdn.example');
}

describe('runMediaLadder', () => {
  it('ranks contestants from bench-valid match records and skips reference tasks it cannot supply', async () => {
    const { deps, judgeCalls } = harness();
    const section = await runMediaLadder(
      deps,
      await options([STRONG, WEAK]),
      new AbortController().signal,
    );

    assertBenchValidateRules(section);
    expect(section.isPublicLadderEligible).toBe(false);
    expect(section.calibration.isDecisionGrade).toBe(false);
    expect(section.technicalDims.source).toBe('absent');
    expect(
      section.tasks.find((task) => task.id === 'character-consistency')
        ?.skippedReason,
    ).toMatch(/reference not supplied: character-sheet/);
    expect(section.matches).toHaveLength(2);
    expect(
      section.matches.every(({ match }) => match.state === 'recorded'),
    ).toBe(true);
    expect(section.ladder[0]?.contestantId).toBe(STRONG.contestant.id);
    expect(section.ladder[0]?.rating).toBeGreaterThan(1500);
    expect(section.ladder[0]?.costPerAcceptedOutput).toBe(2);

    // No judge from either contestant's family sat on a match.
    const judgeModels = new Set(judgeCalls.map(([model]) => model));
    expect(judgeModels.has('anthropic/claude-sonnet-5')).toBe(true);
    expect([...judgeModels].some((model) => model.startsWith('openai/'))).toBe(
      false,
    );
  });

  it('voids matches with an off-spec answer and leaves ratings exactly where decided matches put them', async () => {
    const withoutOffSpec = await runMediaLadder(
      harness().deps,
      await options([STRONG, WEAK]),
      new AbortController().signal,
    );
    const withOffSpec = await runMediaLadder(
      harness().deps,
      await options([STRONG, WEAK, OFF_SPEC]),
      new AbortController().signal,
    );

    assertBenchValidateRules(withOffSpec);
    const offSpecMatches = withOffSpec.matches.filter(
      ({ match }) =>
        match.a.contestantId === OFF_SPEC.contestant.id ||
        match.b.contestantId === OFF_SPEC.contestant.id,
    );
    expect(offSpecMatches.length).toBeGreaterThan(0);
    expect(
      offSpecMatches.every(
        ({ match, voidReason }) =>
          match.state === 'void' && voidReason === 'answer-void',
      ),
    ).toBe(true);

    const offSpecRow = withOffSpec.ladder.find(
      (row) => row.contestantId === OFF_SPEC.contestant.id,
    );
    expect(offSpecRow).toMatchObject({ matches: 0, rating: 1500, voidRate: 1 });
    const ratingOf = (section: MediaLadderSection, id: string) =>
      section.ladder.find((row) => row.contestantId === id)?.rating;
    expect(ratingOf(withOffSpec, STRONG.contestant.id)).toBe(
      ratingOf(withoutOffSpec, STRONG.contestant.id),
    );
    expect(ratingOf(withOffSpec, WEAK.contestant.id)).toBe(
      ratingOf(withoutOffSpec, WEAK.contestant.id),
    );
    expect(
      withOffSpec.answers.find(
        (answer) => answer.contestantId === OFF_SPEC.contestant.id,
      )?.voidReason,
    ).toBe('readiness-blocked');
  });

  it('refuses before any generation when a pair cannot seat three cross-family judges', async () => {
    const { deps, generate } = harness();
    const base = await options([STRONG, WEAK]);
    await expect(
      runMediaLadder(
        deps,
        { ...base, judges: JUDGES.slice(0, 2) },
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(InsufficientJudgePanelError);
    expect(generate).not.toHaveBeenCalled();
  });

  it('reports the partial section marked aborted, then rethrows the spend cap', async () => {
    const { deps } = harness({ spendCapAfter: 1 });
    const progress: MediaLadderSection[] = [];
    await expect(
      runMediaLadder(
        deps,
        await options([STRONG, WEAK]),
        new AbortController().signal,
        (section) => progress.push(section),
      ),
    ).rejects.toBeInstanceOf(SpendCapExceededError);
    const partial = progress.at(-1);
    expect(partial?.isAborted).toBe(true);
    expect(partial?.answers).toHaveLength(1);
    expect(partial?.matches).toHaveLength(0);
  });
});
