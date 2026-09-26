import { describe, expect, it } from 'vitest';
import { recomputeElo } from './elo';
import { resolveMediaModelFamily, UnknownModelFamilyError } from './families';
import {
  resolvePanelVerdict,
  selectEligibleJudges,
  shouldSwapPositions,
} from './panel';

const JUDGES = [
  { family: 'anthropic', modelId: 'anthropic/claude-sonnet-5' },
  { family: 'openai', modelId: 'openai/gpt-5.6-luna' },
  { family: 'google', modelId: 'google/gemini-3-flash' },
  { family: 'xai', modelId: 'x-ai/grok-4.6' },
  { family: 'anthropic', modelId: 'anthropic/claude-sonnet-5' },
];

describe('resolveMediaModelFamily', () => {
  it('maps registry keys behind any host to the vendor that trained them', () => {
    expect(resolveMediaModelFamily('openai/gpt-image-2')).toBe('openai');
    expect(resolveMediaModelFamily('fal-ai/nano-banana-2')).toBe('google');
    expect(resolveMediaModelFamily('google/veo-3.1')).toBe('google');
    expect(resolveMediaModelFamily('fal-ai/flux/schnell')).toBe(
      'black-forest-labs',
    );
    expect(resolveMediaModelFamily('genfeed-ai/flux2-dev')).toBe(
      'black-forest-labs',
    );
    expect(resolveMediaModelFamily('bytedance/seedream-5-pro')).toBe(
      'bytedance',
    );
    expect(resolveMediaModelFamily('x-ai/grok-imagine-image')).toBe('xai');
    expect(resolveMediaModelFamily('wan-video/wan-2.7-t2v')).toBe('qwen');
    expect(resolveMediaModelFamily('anthropic/claude-sonnet-5')).toBe(
      'anthropic',
    );
  });

  it('refuses to guess an unknown family', () => {
    expect(() => resolveMediaModelFamily('acme/mystery-model')).toThrow(
      UnknownModelFamilyError,
    );
  });
});

describe('selectEligibleJudges', () => {
  it('drops judges from either contestant family and duplicate model ids', () => {
    const eligible = selectEligibleJudges(JUDGES, ['openai', 'Google']);
    expect(eligible.map((judge) => judge.modelId)).toEqual([
      'anthropic/claude-sonnet-5',
      'x-ai/grok-4.6',
    ]);
  });
});

describe('resolvePanelVerdict', () => {
  it('records a strict majority of the panel', () => {
    expect(resolvePanelVerdict(['a', 'a', 'b']).verdict).toBe('a');
    expect(resolvePanelVerdict(['b', 'b', 'void']).verdict).toBe('b');
  });

  it('voids ties, split panels and short panels', () => {
    expect(resolvePanelVerdict(['a', 'b', 'void']).verdict).toBe('void');
    expect(resolvePanelVerdict(['a', 'void', 'void']).verdict).toBe('void');
    expect(resolvePanelVerdict(['a', 'a', 'b', 'b']).verdict).toBe('void');
    expect(resolvePanelVerdict(['a', 'a']).verdict).toBe('void');
  });
});

describe('shouldSwapPositions', () => {
  it('is deterministic per run seed and match, and actually shuffles', () => {
    const ids = Array.from({ length: 64 }, (_, index) => `m-${index}`);
    const first = ids.map((id) => shouldSwapPositions(7, id));
    expect(ids.map((id) => shouldSwapPositions(7, id))).toEqual(first);
    const swapped = first.filter(Boolean).length;
    expect(swapped).toBeGreaterThan(16);
    expect(swapped).toBeLessThan(48);
  });
});

describe('recomputeElo', () => {
  const answer = (contestantId: string) => ({
    artifactUrl: `genfeed-ingredient://${contestantId}`,
    contestantId,
    seed: 1,
    settings: {},
  });
  const match = (
    id: string,
    state: 'recorded' | 'void',
    verdict: 'a' | 'b' | 'void',
  ) => ({
    a: answer('one'),
    b: answer('two'),
    id,
    ratingChange: null,
    recordedAt: null,
    seasonId: 's',
    state,
    taskId: 't',
    taskVersion: 1,
    verdict,
    votes: [],
  });

  it('moves ratings by K=24 from a 1500 seed on a decided match', () => {
    const result = recomputeElo([match('m1', 'recorded', 'a')], ['one', 'two']);
    expect(result.recorded).toBe(1);
    expect(result.standings).toEqual([
      expect.objectContaining({ contestantId: 'one', rating: 1512, wins: 1 }),
      expect.objectContaining({ contestantId: 'two', losses: 1, rating: 1488 }),
    ]);
    expect(result.outcomes[0]?.ratingChange).toEqual({ a: 12, b: -12 });
  });

  it('counts a void without moving any rating', () => {
    const decided = recomputeElo(
      [match('m1', 'recorded', 'b')],
      ['one', 'two'],
    );
    const withVoid = recomputeElo(
      [match('m1', 'recorded', 'b'), match('m2', 'void', 'void')],
      ['one', 'two'],
    );
    expect(withVoid.standings.map((row) => row.rating)).toEqual(
      decided.standings.map((row) => row.rating),
    );
    expect(withVoid.standings.every((row) => row.voids === 1)).toBe(true);
    expect(withVoid.outcomes[1]?.ratingChange).toBeNull();
  });
});
