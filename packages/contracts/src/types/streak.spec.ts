import { describe, expect, it } from 'vitest';
import { STREAK_MILESTONES } from './streak';

describe('streak milestones', () => {
  it('labels every milestone reward', () => {
    for (const milestone of STREAK_MILESTONES) {
      expect(milestone.rewardLabel.length).toBeGreaterThan(0);
    }
  });
});
