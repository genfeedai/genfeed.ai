import { KnowledgeConflictJudgeService } from '@api/collections/contexts/services/knowledge-conflict-judge.service';
import { describe, expect, it, vi } from 'vitest';

const passageA = { text: 'Plans start at $29 per month.', title: 'Pricing' };
const passageB = {
  text: 'The starter plan costs $49 a month.',
  title: 'Price list',
};

function judgeWith(completeStructured: () => Promise<unknown>) {
  return new KnowledgeConflictJudgeService(
    { completeStructured } as never,
    { warn: vi.fn() } as never,
  );
}

describe('KnowledgeConflictJudgeService', () => {
  it('returns the conflict when the model quotes both passages', async () => {
    const verdict = await judgeWith(async () => ({
      excerptA: '$29 per month',
      excerptB: '$49 a month',
      isConflict: true,
      summary: 'Different starting prices.',
    })).judge('org-a', passageA, passageB);
    expect(verdict).toEqual({
      conflict: {
        excerptA: '$29 per month',
        excerptB: '$49 a month',
        summary: 'Different starting prices.',
      },
      kind: 'conflict',
    });
  });

  it('treats a conflict with invented quotes as consistent, not as a conflict', async () => {
    const verdict = await judgeWith(async () => ({
      excerptA: '$99',
      excerptB: '$49 a month',
      isConflict: true,
      summary: 'Different starting prices.',
    })).judge('org-a', passageA, passageB);
    expect(verdict).toEqual({ kind: 'consistent' });
  });

  it('reports an unavailable model as unavailable so the pair is judged again', async () => {
    const verdict = await judgeWith(async () => {
      throw new Error('budget exhausted');
    }).judge('org-a', passageA, passageB);
    expect(verdict).toEqual({ kind: 'unavailable' });
  });
});
