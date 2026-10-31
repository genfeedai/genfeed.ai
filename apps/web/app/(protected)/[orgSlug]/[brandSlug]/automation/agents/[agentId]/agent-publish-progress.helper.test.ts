import { describe, expect, it } from 'vitest';
import {
  approvalsToGraduateChoices,
  buildPlatformApprovalProgress,
  readApprovalsToGraduate,
} from './agent-publish-progress.helper';

describe('readApprovalsToGraduate', () => {
  it.each([1, 5, 12, 100])('keeps the valid threshold %s', (threshold) => {
    expect(readApprovalsToGraduate(threshold)).toBe(threshold);
  });

  it.each([0, -1, 1.5, 101, Number.NaN, Number.POSITIVE_INFINITY, undefined])(
    'uses the server default for %s',
    (threshold) => {
      expect(readApprovalsToGraduate(threshold)).toBe(5);
    },
  );
});

describe('approvalsToGraduateChoices', () => {
  it('offers the presets', () => {
    expect(approvalsToGraduateChoices(5)).toEqual([3, 5, 10, 20]);
  });

  it('keeps a stored value that is not a preset, in order', () => {
    expect(approvalsToGraduateChoices(7)).toEqual([3, 5, 7, 10, 20]);
  });
});

describe('buildPlatformApprovalProgress', () => {
  it('lists configured platforms first, then recorded ones, each once', () => {
    expect(
      buildPlatformApprovalProgress(['linkedin', 'linkedin'], {
        mastodon: { approvalStreak: 2, autoPublishEnabled: false },
        instagram: { approvalStreak: 1, autoPublishEnabled: false },
        linkedin: {
          approvalStreak: 5,
          autoPublishEnabled: true,
          lastDecisionKey: 'private-key',
        },
      }),
    ).toEqual([
      {
        approvalStreak: 5,
        isGraduated: true,
        label: 'LinkedIn',
        platform: 'linkedin',
      },
      {
        approvalStreak: 1,
        isGraduated: false,
        label: 'Instagram',
        platform: 'instagram',
      },
      {
        approvalStreak: 2,
        isGraduated: false,
        label: 'Mastodon',
        platform: 'mastodon',
      },
    ]);
  });

  it('starts a platform with no record at zero, in review', () => {
    expect(buildPlatformApprovalProgress(['twitter'], undefined)).toEqual([
      {
        approvalStreak: 0,
        isGraduated: false,
        label: 'X',
        platform: 'twitter',
      },
    ]);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'shows zero for the invalid stored streak %s',
    (approvalStreak) => {
      expect(
        buildPlatformApprovalProgress(['linkedin'], {
          linkedin: { approvalStreak, autoPublishEnabled: false },
        })[0]?.approvalStreak,
      ).toBe(0);
    },
  );
});
