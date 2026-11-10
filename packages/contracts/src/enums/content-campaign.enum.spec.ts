import { describe, expect, it } from 'vitest';
import {
  CONTENT_CAMPAIGN_STATE_MACHINE,
  ContentCampaignStatus,
} from './content-campaign.enum';

describe('CONTENT_CAMPAIGN_STATE_MACHINE', () => {
  it.each([
    [
      ContentCampaignStatus.DRAFT,
      [
        ContentCampaignStatus.ACTIVE,
        ContentCampaignStatus.PAUSED,
        ContentCampaignStatus.COMPLETED,
        ContentCampaignStatus.ARCHIVED,
      ],
    ],
    [
      ContentCampaignStatus.SCHEDULED,
      [
        ContentCampaignStatus.ACTIVE,
        ContentCampaignStatus.PAUSED,
        ContentCampaignStatus.COMPLETED,
        ContentCampaignStatus.ARCHIVED,
      ],
    ],
    [
      ContentCampaignStatus.ACTIVE,
      [
        ContentCampaignStatus.PAUSED,
        ContentCampaignStatus.COMPLETED,
        ContentCampaignStatus.ARCHIVED,
      ],
    ],
    [
      ContentCampaignStatus.PAUSED,
      [
        ContentCampaignStatus.ACTIVE,
        ContentCampaignStatus.COMPLETED,
        ContentCampaignStatus.ARCHIVED,
      ],
    ],
    [ContentCampaignStatus.COMPLETED, [ContentCampaignStatus.ARCHIVED]],
    [
      ContentCampaignStatus.ARCHIVED,
      [
        ContentCampaignStatus.DRAFT,
        ContentCampaignStatus.SCHEDULED,
        ContentCampaignStatus.ACTIVE,
        ContentCampaignStatus.PAUSED,
        ContentCampaignStatus.COMPLETED,
      ],
    ],
  ])('%s moves to %j', (from, expected) => {
    expect(CONTENT_CAMPAIGN_STATE_MACHINE.next(from)).toEqual(expected);
  });

  it.each([
    // A completed campaign cannot start or pause again
    // (CONTENT_CAMPAIGN_LIFECYCLE_ALLOWED_FROM).
    [ContentCampaignStatus.COMPLETED, ContentCampaignStatus.ACTIVE, false],
    [ContentCampaignStatus.COMPLETED, ContentCampaignStatus.PAUSED, false],
    // An archived campaign only leaves through restore.
    [ContentCampaignStatus.ARCHIVED, ContentCampaignStatus.DRAFT, true],
    [ContentCampaignStatus.DRAFT, ContentCampaignStatus.COMPLETED, true],
  ])('%s -> %s is legal: %s', (from, to, expected) => {
    expect(CONTENT_CAMPAIGN_STATE_MACHINE.can(from, to)).toBe(expected);
  });
});
