import { describe, expect, test } from 'vitest';
import { CampaignPlatform, CampaignType } from '../../src';
import {
  doesOutreachTargetPlatformMatch,
  evaluateOutreachCapability,
  getOutreachCapabilityRefusal,
  isOutreachPairExecutable,
  listExecutableOutreachCampaignTypes,
  listExecutableOutreachPairs,
  listExecutableOutreachPlatforms,
  listOutreachCapabilityMatrix,
  OUTREACH_ACTIVE_CONFIGURATION_LOCKED_ERROR,
  OUTREACH_CAPABILITY_MATRIX,
  OUTREACH_CAPABILITY_REVIEWED_ON,
  OUTREACH_CAPABILITY_UNAVAILABLE_ERROR,
  OUTREACH_TARGET_PLATFORM_MISMATCH_ERROR,
  outreachCapabilityEvaluationSchema,
} from '../../src/api-types/contracts/outreach-capabilities.contract';

const EXPECTED_MATRIX: ReadonlyArray<{
  campaignType: CampaignType;
  platform: CampaignPlatform;
  reason:
    | 'verified_x_public_reply'
    | 'verified_x_dm'
    | 'verified_x_scheduled_blast'
    | 'scheduled_blast_unavailable'
    | 'platform_unavailable';
  result: 'executable' | 'unavailable';
}> = [
  {
    campaignType: CampaignType.MANUAL,
    platform: CampaignPlatform.TWITTER,
    reason: 'verified_x_public_reply',
    result: 'executable',
  },
  {
    campaignType: CampaignType.DISCOVERY,
    platform: CampaignPlatform.TWITTER,
    reason: 'verified_x_public_reply',
    result: 'executable',
  },
  {
    campaignType: CampaignType.DM_OUTREACH,
    platform: CampaignPlatform.TWITTER,
    reason: 'verified_x_dm',
    result: 'executable',
  },
  {
    campaignType: CampaignType.SCHEDULED_BLAST,
    platform: CampaignPlatform.TWITTER,
    reason: 'verified_x_scheduled_blast',
    result: 'executable',
  },
  {
    campaignType: CampaignType.MANUAL,
    platform: CampaignPlatform.REDDIT,
    reason: 'platform_unavailable',
    result: 'unavailable',
  },
  {
    campaignType: CampaignType.DISCOVERY,
    platform: CampaignPlatform.REDDIT,
    reason: 'platform_unavailable',
    result: 'unavailable',
  },
  {
    campaignType: CampaignType.DM_OUTREACH,
    platform: CampaignPlatform.REDDIT,
    reason: 'platform_unavailable',
    result: 'unavailable',
  },
  {
    campaignType: CampaignType.SCHEDULED_BLAST,
    platform: CampaignPlatform.REDDIT,
    reason: 'platform_unavailable',
    result: 'unavailable',
  },
  {
    campaignType: CampaignType.MANUAL,
    platform: CampaignPlatform.INSTAGRAM,
    reason: 'platform_unavailable',
    result: 'unavailable',
  },
  {
    campaignType: CampaignType.DISCOVERY,
    platform: CampaignPlatform.INSTAGRAM,
    reason: 'platform_unavailable',
    result: 'unavailable',
  },
  {
    campaignType: CampaignType.DM_OUTREACH,
    platform: CampaignPlatform.INSTAGRAM,
    reason: 'platform_unavailable',
    result: 'unavailable',
  },
  {
    campaignType: CampaignType.SCHEDULED_BLAST,
    platform: CampaignPlatform.INSTAGRAM,
    reason: 'platform_unavailable',
    result: 'unavailable',
  },
];

describe('outreach capability matrix', () => {
  test('asserts an explicit result and reason for every campaign platform/type pair', () => {
    const actualPairs = Object.values(CampaignPlatform).flatMap((platform) =>
      Object.values(CampaignType).map((campaignType) => ({
        campaignType,
        platform,
      })),
    );

    expect(EXPECTED_MATRIX).toHaveLength(actualPairs.length);
    expect(listOutreachCapabilityMatrix()).toHaveLength(actualPairs.length);

    for (const expected of EXPECTED_MATRIX) {
      const evaluation = evaluateOutreachCapability(expected);
      const parsed = outreachCapabilityEvaluationSchema.parse(evaluation);

      expect(parsed).toMatchObject({
        campaignType: expected.campaignType,
        executable: expected.result === 'executable',
        platform: expected.platform,
        reason: expected.reason,
        result: expected.result,
        reviewedOn: OUTREACH_CAPABILITY_REVIEWED_ON,
      });
      expect(
        OUTREACH_CAPABILITY_MATRIX[expected.platform][expected.campaignType],
      ).toEqual(parsed);
      expect(isOutreachPairExecutable(expected)).toBe(
        expected.result === 'executable',
      );
    }
  });

  test('enables verified X public-reply, X DM, and X Scheduled Blast pairs', () => {
    expect(listExecutableOutreachPairs()).toEqual([
      {
        campaignType: CampaignType.MANUAL,
        platform: CampaignPlatform.TWITTER,
      },
      {
        campaignType: CampaignType.DISCOVERY,
        platform: CampaignPlatform.TWITTER,
      },
      {
        campaignType: CampaignType.SCHEDULED_BLAST,
        platform: CampaignPlatform.TWITTER,
      },
      {
        campaignType: CampaignType.DM_OUTREACH,
        platform: CampaignPlatform.TWITTER,
      },
    ]);
    expect(listExecutableOutreachPlatforms()).toEqual([
      CampaignPlatform.TWITTER,
    ]);
    expect(listExecutableOutreachCampaignTypes()).toEqual([
      CampaignType.MANUAL,
      CampaignType.DISCOVERY,
      CampaignType.SCHEDULED_BLAST,
      CampaignType.DM_OUTREACH,
    ]);
  });

  test('keeps Reddit and Instagram unavailable and marks X Scheduled Blast executable', () => {
    expect(
      evaluateOutreachCapability({
        campaignType: CampaignType.SCHEDULED_BLAST,
        platform: CampaignPlatform.TWITTER,
      }),
    ).toMatchObject({
      executable: true,
      reason: 'verified_x_scheduled_blast',
      result: 'executable',
    });
    expect(
      evaluateOutreachCapability({
        campaignType: CampaignType.MANUAL,
        platform: CampaignPlatform.REDDIT,
      }).reason,
    ).toBe('platform_unavailable');
    expect(
      evaluateOutreachCapability({
        campaignType: CampaignType.DM_OUTREACH,
        platform: CampaignPlatform.INSTAGRAM,
      }).reason,
    ).toBe('platform_unavailable');
  });

  test('returns a stable unknown-pair fallback for historical values', () => {
    expect(
      evaluateOutreachCapability({
        campaignType: 'reply',
        platform: 'myspace',
      }),
    ).toMatchObject({
      campaignType: 'reply',
      executable: false,
      platform: 'myspace',
      reason: 'unknown_pair',
      result: 'unavailable',
    });
    expect(evaluateOutreachCapability({})).toMatchObject({
      campaignType: 'unknown',
      platform: 'unknown',
      reason: 'unknown_pair',
    });
    expect(
      evaluateOutreachCapability({
        campaignType: CampaignType.MANUAL,
        platform: 'X',
      }).executable,
    ).toBe(true);
  });

  test('returns one stable client error for every unavailable pair', () => {
    expect(
      getOutreachCapabilityRefusal({
        campaignType: CampaignType.MANUAL,
        platform: CampaignPlatform.TWITTER,
      }),
    ).toBeUndefined();
    expect(
      getOutreachCapabilityRefusal({
        campaignType: CampaignType.SCHEDULED_BLAST,
        platform: CampaignPlatform.TWITTER,
      }),
    ).toBeUndefined();

    const reddit = getOutreachCapabilityRefusal({
      campaignType: CampaignType.MANUAL,
      platform: CampaignPlatform.REDDIT,
    });
    const scheduledOnReddit = getOutreachCapabilityRefusal({
      campaignType: CampaignType.SCHEDULED_BLAST,
      platform: CampaignPlatform.REDDIT,
    });
    const unknown = getOutreachCapabilityRefusal({
      campaignType: 'reply',
      platform: 'myspace',
    });

    expect(reddit).toEqual({
      code: OUTREACH_CAPABILITY_UNAVAILABLE_ERROR.code,
      message: OUTREACH_CAPABILITY_UNAVAILABLE_ERROR.message,
      reason: 'platform_unavailable',
    });
    expect(scheduledOnReddit?.message).toBe(reddit?.message);
    expect(unknown?.message).toBe(reddit?.message);
    expect(unknown?.reason).toBe('unknown_pair');
  });

  test('exports stable target-mismatch and active-lock errors', () => {
    expect(
      doesOutreachTargetPlatformMatch({
        campaignPlatform: CampaignPlatform.TWITTER,
        targetPlatform: 'x',
      }),
    ).toBe(true);
    expect(
      doesOutreachTargetPlatformMatch({
        campaignPlatform: CampaignPlatform.TWITTER,
        targetPlatform: CampaignPlatform.REDDIT,
      }),
    ).toBe(false);
    expect(
      doesOutreachTargetPlatformMatch({
        campaignPlatform: CampaignPlatform.TWITTER,
        targetPlatform: 'myspace',
      }),
    ).toBe(false);

    expect(OUTREACH_TARGET_PLATFORM_MISMATCH_ERROR).toEqual({
      code: 'outreach_capability.target_platform_mismatch',
      message: 'Target platform must match the campaign platform.',
    });
    expect(OUTREACH_ACTIVE_CONFIGURATION_LOCKED_ERROR).toEqual({
      code: 'outreach_capability.active_configuration_locked',
      message: 'Active campaigns cannot change platform or campaign type.',
    });
  });
});
