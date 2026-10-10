import { describe, expect, it, vi } from 'vitest';
import { LowCreditThresholdService } from './low-credit-threshold.service';

function build(options: {
  defaultImageCredits?: number | null;
  latestPaidGrantCredits?: number | null;
  trial?: { isTrialExpired: boolean; trialEndsAt: Date | null };
}) {
  const getLatestPaidGrantCredits = vi
    .fn()
    .mockResolvedValue(options.latestPaidGrantCredits ?? null);
  const getDefaultImageCredits = vi
    .fn()
    .mockResolvedValue(
      options.defaultImageCredits === undefined
        ? 8
        : options.defaultImageCredits,
    );
  const settingsFindFirst = vi
    .fn()
    .mockResolvedValue({ defaultImageModel: 'org-image-model' });
  const service = new LowCreditThresholdService(
    { organizationSetting: { findFirst: settingsFindFirst } } as never,
    {
      getState: vi
        .fn()
        .mockResolvedValue(
          options.trial ?? { isTrialExpired: false, trialEndsAt: null },
        ),
    } as never,
    { getDefaultImageCredits } as never,
    { getLatestPaidGrantCredits } as never,
  );
  return { getDefaultImageCredits, getLatestPaidGrantCredits, service };
}

describe('LowCreditThresholdService', () => {
  it('uses 10% of the latest paid grant for a paying organization', async () => {
    const { getDefaultImageCredits, service } = build({
      latestPaidGrantCredits: 5_000,
    });

    await expect(service.resolve('org-1')).resolves.toEqual({
      isTrialSubject: false,
      threshold: 500,
    });
    expect(getDefaultImageCredits).toHaveBeenCalledWith(
      'org-1',
      'org-image-model',
    );
  });

  it('never drops a paying organization below one default image', async () => {
    const { service } = build({
      defaultImageCredits: 40,
      latestPaidGrantCredits: 100,
    });

    await expect(service.resolve('org-1')).resolves.toMatchObject({
      threshold: 40,
    });
  });

  it('uses one default image for a never-paid organization in its trial', async () => {
    const { getLatestPaidGrantCredits, service } = build({
      trial: {
        isTrialExpired: false,
        trialEndsAt: new Date('2026-10-14T00:00:00.000Z'),
      },
    });

    await expect(service.resolve('org-1')).resolves.toEqual({
      isTrialSubject: true,
      threshold: 8,
    });
    expect(getLatestPaidGrantCredits).not.toHaveBeenCalled();
  });

  it('reports no threshold for an expired trial', async () => {
    const { getDefaultImageCredits, service } = build({
      trial: {
        isTrialExpired: true,
        trialEndsAt: new Date('2026-10-01T00:00:00.000Z'),
      },
    });

    await expect(service.resolve('org-1')).resolves.toEqual({
      isTrialSubject: true,
      threshold: null,
    });
    expect(getDefaultImageCredits).not.toHaveBeenCalled();
  });

  it('reports no threshold when neither a price nor a paid grant is known', async () => {
    const { service } = build({ defaultImageCredits: null });

    await expect(service.resolve('org-1')).resolves.toMatchObject({
      threshold: null,
    });
  });
});
