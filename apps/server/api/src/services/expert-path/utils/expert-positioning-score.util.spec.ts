import { scoreExpertPositioning } from '@api/services/expert-path/utils/expert-positioning-score.util';
import type { ExpertPositioningAnswers } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';

const STRONG_ANSWERS: ExpertPositioningAnswers = {
  authoritySignals:
    'Helped 140 clients grow revenue 32%. Former CFO, 15 years in finance. Featured on the Indie Hackers podcast and spoke at SaaStr. Newsletter with 22k subscribers.',
  bigDomino:
    'If founders believe cash flow is a design problem, not an accounting problem, then every other objection stops mattering.',
  contrarianBeliefs:
    'Most people think you need a fractional CFO. That is wrong: the myth is that finance is reporting. Actually it is product design.',
  newOpportunity:
    'Stop hiring bookkeepers to explain the past. Instead of monthly reports, replace them with a weekly cash design ritual — a new way to run the company.',
  notForWho: 'Not for venture-backed teams burning cash on purpose.',
  originStory:
    'I used to run finance at a startup that nearly went bankrupt because we could not read our own numbers. We hit a wall in 2019. That is when I realized cash flow is designed, not reported. So I built a weekly ritual. Now I teach it to founders.',
  transformation:
    'I take founders from dreading the bank balance to deciding with it every Monday.',
};

describe('scoreExpertPositioning', () => {
  it('scores six weighted dimensions and normalizes the total to 100', () => {
    const score = scoreExpertPositioning(
      STRONG_ANSWERS,
      new Date('2026-09-19T00:00:00.000Z'),
    );

    expect(score.version).toBe(1);
    expect(score.scoredAt).toBe('2026-09-19T00:00:00.000Z');
    expect(score.dimensions.map((dimension) => dimension.key)).toEqual([
      'attractiveCharacter',
      'originStory',
      'bigDomino',
      'newOpportunity',
      'authoritySignals',
      'differentiation',
    ]);
    expect(
      score.dimensions.map((dimension) => [dimension.key, dimension.weight]),
    ).toEqual([
      ['attractiveCharacter', 2],
      ['originStory', 1.5],
      ['bigDomino', 2],
      ['newOpportunity', 1.5],
      ['authoritySignals', 1],
      ['differentiation', 1],
    ]);
    for (const dimension of score.dimensions) {
      expect(dimension.score).toBeGreaterThanOrEqual(0);
      expect(dimension.score).toBeLessThanOrEqual(10);
      expect(dimension.weightedScore).toBe(dimension.score * dimension.weight);
      expect(dimension.maxWeightedScore).toBe(dimension.weight * 10);
      expect(dimension.followUpQuestion.length).toBeGreaterThan(0);
    }
    expect(score.totalScore).toBeGreaterThanOrEqual(70);
    expect(['expert_positioned', 'good_foundation']).toContain(score.rating);
  });

  it('scores empty answers as invisible with every dimension at zero', () => {
    const score = scoreExpertPositioning({});

    expect(score.totalScore).toBe(0);
    expect(score.rating).toBe('invisible');
    expect(score.dimensions.every((dimension) => dimension.score === 0)).toBe(
      true,
    );
    // Ties resolve to the heaviest dimension first, in rubric order.
    expect(score.weakestDimension).toBe('attractiveCharacter');
  });

  it('surfaces the missing dimension as the weakest', () => {
    const score = scoreExpertPositioning({
      ...STRONG_ANSWERS,
      bigDomino: '',
    });

    expect(
      score.dimensions.find((dimension) => dimension.key === 'bigDomino')
        ?.score,
    ).toBe(0);
    expect(score.weakestDimension).toBe('bigDomino');
  });

  it('rewards new-opportunity framing over improvement framing', () => {
    const improvement = scoreExpertPositioning({
      newOpportunity: 'We make bookkeeping better, faster and more optimized.',
    });
    const opportunity = scoreExpertPositioning({
      newOpportunity:
        'Stop reading reports. Instead of bookkeeping, replace it with a new way: a weekly cash ritual.',
    });
    const read = (value: typeof improvement) =>
      value.dimensions.find((dimension) => dimension.key === 'newOpportunity')
        ?.score ?? 0;

    expect(read(opportunity)).toBeGreaterThan(read(improvement));
  });

  it('counts distinct authority proof types', () => {
    const thin = scoreExpertPositioning({
      authoritySignals: 'I know a lot about this.',
    });
    const rich = scoreExpertPositioning({
      authoritySignals: STRONG_ANSWERS.authoritySignals,
    });
    const read = (value: typeof thin) =>
      value.dimensions.find((dimension) => dimension.key === 'authoritySignals')
        ?.score ?? 0;

    expect(read(thin)).toBeLessThan(3);
    expect(read(rich)).toBeGreaterThanOrEqual(8);
  });

  it('is deterministic for the same answers', () => {
    const at = new Date('2026-09-19T00:00:00.000Z');
    expect(scoreExpertPositioning(STRONG_ANSWERS, at)).toEqual(
      scoreExpertPositioning(STRONG_ANSWERS, at),
    );
  });
});
