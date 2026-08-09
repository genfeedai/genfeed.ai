import { describe, expect, it } from 'vitest';
import { STREAK_MILESTONES } from './streak';

describe('streak milestones', () => {
  it('defines milestones in strictly ascending day order', () => {
    const days = STREAK_MILESTONES.map((milestone) => milestone.days);
    expect(days).toEqual([3, 7, 30, 100, 365]);
  });

  it('never decreases the credit reward as milestones grow', () => {
    for (let index = 1; index < STREAK_MILESTONES.length; index += 1) {
      expect(STREAK_MILESTONES[index].rewardCredits).toBeGreaterThanOrEqual(
        STREAK_MILESTONES[index - 1].rewardCredits,
      );
    }
  });

  it('labels every milestone reward', () => {
    for (const milestone of STREAK_MILESTONES) {
      expect(milestone.rewardLabel.length).toBeGreaterThan(0);
    }
  });
});
