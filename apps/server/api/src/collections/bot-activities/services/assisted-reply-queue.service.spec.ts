import { AssistedReplyQueueService } from '@api/collections/bot-activities/services/assisted-reply-queue.service';
import type { BotActivitiesService } from '@api/collections/bot-activities/services/bot-activities.service';
import { BotActivityStatus } from '@genfeedai/contracts';
import { ASSISTED_X_REPLY_DAILY_CAP } from '@genfeedai/contracts/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SCOPE = { brandId: 'brand-1', organizationId: 'org-1' };

function awaitingActivity(overrides: Record<string, unknown> = {}) {
  return {
    brandId: 'brand-1',
    draftReplyText: 'Sharp take.',
    id: 'activity-1',
    organizationId: 'org-1',
    status: BotActivityStatus.AWAITING_APPROVAL,
    triggerTweetAuthorUsername: 'target',
    triggerTweetId: '1846123456789012345',
    ...overrides,
  };
}

describe('AssistedReplyQueueService', () => {
  const botActivities = {
    countAwaitingApproval: vi.fn(),
    countManuallyPostedSince: vi.fn(),
    findLatestManuallyPostedAt: vi.fn(),
    findOne: vi.fn(),
    markDismissed: vi.fn(),
    markManuallyPosted: vi.fn(),
    updateDraft: vi.fn(),
  };
  let service: AssistedReplyQueueService;

  beforeEach(() => {
    vi.resetAllMocks();
    botActivities.countAwaitingApproval.mockResolvedValue(3);
    botActivities.countManuallyPostedSince.mockResolvedValue(0);
    botActivities.findLatestManuallyPostedAt.mockResolvedValue(null);
    botActivities.findOne.mockResolvedValue(awaitingActivity());
    service = new AssistedReplyQueueService(
      botActivities as unknown as BotActivitiesService,
    );
  });

  it('reports what is left of the daily cap', async () => {
    botActivities.countManuallyPostedSince.mockResolvedValue(5);

    await expect(service.getUsage(SCOPE)).resolves.toMatchObject({
      awaiting: 3,
      dailyCap: ASSISTED_X_REPLY_DAILY_CAP,
      nextAllowedAt: null,
      postedToday: 5,
      remainingToday: ASSISTED_X_REPLY_DAILY_CAP - 5,
    });
  });

  it('opens the edited draft in the X composer without posting it', async () => {
    const result = await service.open(SCOPE, 'activity-1', 'Better take.');

    expect(botActivities.updateDraft).toHaveBeenCalledWith(
      'activity-1',
      'org-1',
      'Better take.',
    );
    expect(result.intentUrl).toBe(
      'https://x.com/intent/post?in_reply_to=1846123456789012345&text=Better%20take.',
    );
    expect(result.targetUrl).toBe(
      'https://x.com/target/status/1846123456789012345',
    );
    expect(botActivities.markManuallyPosted).not.toHaveBeenCalled();
  });

  it('blocks a reply once the daily cap is used', async () => {
    botActivities.countManuallyPostedSince.mockResolvedValue(
      ASSISTED_X_REPLY_DAILY_CAP,
    );

    await expect(service.open(SCOPE, 'activity-1')).rejects.toThrow(
      /Daily limit reached/,
    );
    await expect(service.markPosted(SCOPE, 'activity-1')).rejects.toThrow(
      /Daily limit reached/,
    );
    expect(botActivities.markManuallyPosted).not.toHaveBeenCalled();
  });

  it('spaces replies apart so the account does not post in bursts', async () => {
    botActivities.findLatestManuallyPostedAt.mockResolvedValue(
      new Date(Date.now() - 60 * 1000),
    );

    await expect(service.open(SCOPE, 'activity-1')).rejects.toThrow(
      /does not post in bursts/,
    );
  });

  it('counts a reply toward the cap only once the person confirms it', async () => {
    botActivities.countManuallyPostedSince.mockResolvedValue(1);

    await service.markPosted(SCOPE, 'activity-1');

    expect(botActivities.markManuallyPosted).toHaveBeenCalledWith(
      'activity-1',
      'org-1',
      'Sharp take.',
    );
  });

  it('refuses a reply that is no longer waiting', async () => {
    botActivities.findOne.mockResolvedValue(
      awaitingActivity({ status: BotActivityStatus.COMPLETED }),
    );

    await expect(service.markPosted(SCOPE, 'activity-1')).rejects.toThrow(
      /no longer waiting/,
    );
  });

  it('does not reveal another brand’s draft', async () => {
    botActivities.findOne.mockResolvedValue(
      awaitingActivity({ brandId: 'brand-2' }),
    );

    await expect(service.dismiss(SCOPE, 'activity-1')).rejects.toThrow(
      /not found/i,
    );
    expect(botActivities.markDismissed).not.toHaveBeenCalled();
  });

  it('dismisses a draft without touching the cap', async () => {
    await service.dismiss(SCOPE, 'activity-1');

    expect(botActivities.markDismissed).toHaveBeenCalledWith(
      'activity-1',
      'org-1',
    );
  });
});
