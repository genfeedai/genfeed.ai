import type { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import { resolveTurboRunLearningSignals } from '@api/services/turbo-run/turbo-run-learning-signals';
import { describe, expect, it, vi } from 'vitest';

function serviceWith(profile: unknown): HarnessProfilesService {
  return {
    getActiveForBrand: vi.fn().mockResolvedValue(profile),
  } as unknown as HarnessProfilesService;
}

describe('resolveTurboRunLearningSignals', () => {
  it('counts the rejections and approvals the profile holds', async () => {
    const result = await resolveTurboRunLearningSignals(
      serviceWith({
        avoidFeedback: [{ content: 'a' }, { content: 'b' }],
        goodFeedback: [{ content: 'c' }],
      }),
      'org-1',
      'brand-1',
    );

    expect(result).toEqual({ approvalCount: 1, rejectionCount: 2 });
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
