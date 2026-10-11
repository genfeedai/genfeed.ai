import { CronCreditsService } from '@workers/crons/credits/cron.credits.service';
import {
  FREE_TRIAL_EXPIRY_LOCK_KEY,
  FREE_TRIAL_EXPIRY_LOCK_TTL_SECONDS,
  FREE_TRIAL_EXPIRY_PAGE_SIZE,
  FREE_TRIAL_EXPIRY_SCHEDULE,
} from '@workers/crons/credits/free-trial-expiry.constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const NOW = new Date('2026-10-10T12:00:00.000Z');

describe('CronCreditsService', () => {
  const referrals = { settleDueRewards: vi.fn() };
  const freeTrial = {
    expireTrialCredits: vi.fn(),
    findExpiryCandidates: vi.fn(),
  };
  const cache = { acquireLock: vi.fn(), releaseLock: vi.fn() };
  const logger = { debug: vi.fn(), error: vi.fn(), log: vi.fn() };
  const service = new CronCreditsService(
    referrals as never,
    freeTrial as never,
    cache as never,
    logger as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    cache.acquireLock.mockResolvedValue(true);
    cache.releaseLock.mockResolvedValue(true);
    freeTrial.findExpiryCandidates.mockResolvedValue([]);
    freeTrial.expireTrialCredits.mockResolvedValue(0);
  });

  it('runs every 15 minutes under a lock shorter than one interval', () => {
    expect(FREE_TRIAL_EXPIRY_SCHEDULE).toBe('*/15 * * * *');
    expect(FREE_TRIAL_EXPIRY_LOCK_TTL_SECONDS).toBe(14 * 60);
  });

  it('delegates referral settlement unchanged', async () => {
    await service.settleReferralRewards();
    expect(referrals.settleDueRewards).toHaveBeenCalledOnce();
  });

  it('skips the tick while another worker holds the sweep', async () => {
    cache.acquireLock.mockResolvedValue(false);

    await expect(service.expireFreeTrials(NOW)).resolves.toBeNull();
    expect(freeTrial.findExpiryCandidates).not.toHaveBeenCalled();
    expect(cache.releaseLock).not.toHaveBeenCalled();
  });

  it('expires every candidate across pages and releases the lock', async () => {
    const firstPage = Array.from(
      { length: FREE_TRIAL_EXPIRY_PAGE_SIZE },
      (_, index) => `org_${String(index).padStart(3, '0')}`,
    );
    freeTrial.findExpiryCandidates
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(['org_999']);
    freeTrial.expireTrialCredits.mockImplementation(
      async (organizationId: string) => (organizationId === 'org_999' ? 40 : 0),
    );

    await expect(service.expireFreeTrials(NOW)).resolves.toEqual({
      expiredCredits: 40,
      failed: 0,
      organizations: 1,
    });
    expect(cache.acquireLock).toHaveBeenCalledWith(
      FREE_TRIAL_EXPIRY_LOCK_KEY,
      FREE_TRIAL_EXPIRY_LOCK_TTL_SECONDS,
    );
    expect(freeTrial.findExpiryCandidates).toHaveBeenNthCalledWith(
      1,
      NOW,
      undefined,
      FREE_TRIAL_EXPIRY_PAGE_SIZE,
    );
    expect(freeTrial.findExpiryCandidates).toHaveBeenNthCalledWith(
      2,
      NOW,
      firstPage[firstPage.length - 1],
      FREE_TRIAL_EXPIRY_PAGE_SIZE,
    );
    expect(freeTrial.expireTrialCredits).toHaveBeenCalledTimes(
      FREE_TRIAL_EXPIRY_PAGE_SIZE + 1,
    );
    expect(cache.releaseLock).toHaveBeenCalledWith(FREE_TRIAL_EXPIRY_LOCK_KEY);
  });

  it('keeps sweeping when one organization fails', async () => {
    freeTrial.findExpiryCandidates.mockResolvedValueOnce(['org_a', 'org_b']);
    freeTrial.expireTrialCredits
      .mockRejectedValueOnce(new Error('serialization exhausted'))
      .mockResolvedValueOnce(25);

    await expect(service.expireFreeTrials(NOW)).resolves.toEqual({
      expiredCredits: 25,
      failed: 1,
      organizations: 1,
    });
    expect(logger.error).toHaveBeenCalledWith(
      'Could not expire free-trial credits',
      expect.objectContaining({ organizationId: 'org_a' }),
    );
  });

  it('releases the lock when discovery throws', async () => {
    freeTrial.findExpiryCandidates.mockRejectedValueOnce(new Error('db down'));

    await expect(service.expireFreeTrials(NOW)).rejects.toThrow('db down');
    expect(cache.releaseLock).toHaveBeenCalledWith(FREE_TRIAL_EXPIRY_LOCK_KEY);
  });
});
