import { describe, expect, it } from 'vitest';
import { matchSchema } from './bench/schema';
import { fixtureRowSchema, scoreBandSchema } from './contracts';

const BENCH_MATCH = {
  a: {
    artifactUrl: 'https://assets.example.com/bench/a.png',
    contestantId: 'flux-schnell',
    seed: 42,
    settings: { aspectRatio: '1:1', steps: 4 },
  },
  b: {
    artifactUrl: 'https://assets.example.com/bench/b.png',
    contestantId: 'flux-schnell.compiled',
    seed: 42,
    settings: { aspectRatio: '1:1', fidelity: 'guided' },
  },
  id: 'season-one-0001',
  recordedAt: '2026-09-26T12:00:00.000Z',
  seasonId: 'season-one',
  state: 'recorded',
  taskId: 'brand-kit-fidelity',
  taskVersion: 1,
  verdict: 'b',
  votes: [
    {
      choice: 'b',
      judgeModelId: 'anthropic/claude-sonnet-5',
      rationale: 'Kit rules held.',
    },
    {
      choice: 'b',
      judgeModelId: 'openai/gpt-5.6-luna',
      rationale: 'Accent used once.',
    },
    {
      choice: 'a',
      judgeModelId: 'x-ai/grok-4.6',
      rationale: 'Sharper product.',
    },
  ],
};

describe('bench match records', () => {
  it('round-trips a match through JSON unchanged', () => {
    const parsed = matchSchema.parse(BENCH_MATCH);
    const reparsed = matchSchema.parse(JSON.parse(JSON.stringify(parsed)));

    expect(reparsed).toEqual(parsed);
    // The bench defaults ratingChange to null until a ladder recompute.
    expect(reparsed.ratingChange).toBeNull();
  });

  it('rejects a signed or non-URL artifact reference shape', () => {
    expect(
      matchSchema.safeParse({
        ...BENCH_MATCH,
        a: { ...BENCH_MATCH.a, artifactUrl: 'not a url' },
      }).success,
    ).toBe(false);
  });
});

describe('fixture rows', () => {
  it('applies brief defaults to a minimal row', () => {
    const row = fixtureRowSchema.parse({
      brandFixtureId: 'synthetic-kelder',
      contentKind: 'social-post',
      id: 'row-1',
      input: { prompt: 'Write a post.' },
      rubricVersion: 'content-quality-v1',
      source: { reference: 'synthetic:kelder', visibility: 'synthetic' },
    });

    expect(row.input.brief).toEqual({
      bannedPhrases: [],
      isCtaRequired: false,
    });
    expect(row.expected).toEqual({});
  });

  it('rejects an inverted score band', () => {
    expect(scoreBandSchema.safeParse({ max: 0.2, min: 0.8 }).success).toBe(
      false,
    );
  });
});
