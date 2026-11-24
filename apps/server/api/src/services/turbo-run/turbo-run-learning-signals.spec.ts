import type { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import { resolveTurboRunLearningSignals } from '@api/services/turbo-run/turbo-run-learning-signals';
import { describe, expect, it, vi } from 'vitest';

function serviceWith(profile: unknown): HarnessProfilesService {
  return {
    getActiveForBrand: vi.fn().mockResolvedValue(profile),
  } as unknown as HarnessProfilesService;
}

describe('resolveTurboRunLearningSignals', () => {
  it('counts the approvals generation reads and leaves rejections out', async () => {
    const result = await resolveTurboRunLearningSignals(
      serviceWith({
        avoidFeedback: [{ content: 'a' }, { content: 'b' }],
        examples: { good: ['c'] },
        goodFeedback: [{ content: 'c' }],
      }),
      'org-1',
      'brand-1',
    );

    expect(result).toEqual({ approvalCount: 1 });
  });

  it('returns nothing for a brand whose only feedback is rejections', async () => {
    await expect(
      resolveTurboRunLearningSignals(
        serviceWith({
          avoidFeedback: [{ content: 'a' }, { content: 'b' }, { content: 'c' }],
          examples: { avoid: [], good: [] },
        }),
        'org-1',
        'brand-1',
      ),
    ).resolves.toBeUndefined();
  });

  it('does not count an approval that is no longer a positive example', async () => {
    await expect(
      resolveTurboRunLearningSignals(
        serviceWith({
          examples: { good: ['kept'] },
          goodFeedback: [
            { content: 'kept' },
            { content: 'removed by operator' },
          ],
        }),
        'org-1',
        'brand-1',
      ),
    ).resolves.toEqual({ approvalCount: 1 });
  });

  it('returns nothing when the profile has no feedback yet', async () => {
    await expect(
      resolveTurboRunLearningSignals(
        serviceWith({ examples: { good: ['curated'] } }),
        'org-1',
        'brand-1',
      ),
    ).resolves.toBeUndefined();
  });

  it('returns nothing without a profile, a brand or a service', async () => {
    await expect(
      resolveTurboRunLearningSignals(serviceWith(null), 'org-1', 'brand-1'),
    ).resolves.toBeUndefined();
    await expect(
      resolveTurboRunLearningSignals(serviceWith({}), 'org-1', null),
    ).resolves.toBeUndefined();
    await expect(
      resolveTurboRunLearningSignals(undefined, 'org-1', 'brand-1'),
    ).resolves.toBeUndefined();
  });
});
