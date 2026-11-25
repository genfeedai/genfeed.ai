import { FreeTrialService } from '@api/collections/credits/services/free-trial.service';
import { PublishingQuotaTierService } from '@api/collections/organization-settings/services/publishing-quota-tier.service';
import { OrganizationPaidAccessService } from '@api/common/subscriptions/organization-paid-access.service';
import { hasOrganizationBilling } from '@genfeedai/config';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ModuleRef } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/config')>()),
  hasOrganizationBilling: vi.fn(),
}));

describe('PublishingQuotaTierService', () => {
  const state = { trialEndsAt: null as Date | null };
  const isGated = { value: false, fails: false };
  const logger = { warn: vi.fn() } as unknown as LoggerService;
  const moduleRef = {
    get: (token: unknown) => {
      if (token === FreeTrialService) {
        return { getState: async () => ({ ...state, isTrialExpired: false }) };
      }
      if (token === OrganizationPaidAccessService) {
        return {
          isSubscriptionGatedFresh: async () => {
            if (isGated.fails) throw new Error('read failed');
            return isGated.value;
          },
        };
      }
      throw new Error('unknown provider');
    },
  } as unknown as ModuleRef;
  let service: PublishingQuotaTierService;

  beforeEach(() => {
    vi.mocked(hasOrganizationBilling).mockReturnValue(true);
    state.trialEndsAt = null;
    isGated.value = false;
    isGated.fails = false;
    service = new PublishingQuotaTierService(moduleRef, logger);
  });

  it('is unmetered without organization billing', async () => {
    vi.mocked(hasOrganizationBilling).mockReturnValue(false);
    expect(await service.resolve('org-1')).toBe('unmetered');
  });

  it('is trial for an organization that never paid', async () => {
    state.trialEndsAt = new Date('2026-11-28T00:00:00Z');
    expect(await service.resolve('org-1')).toBe('trial');
  });

  it('is credits for an organization that paid or was comped but has no plan', async () => {
    isGated.value = true;
    expect(await service.resolve('org-1')).toBe('credits');
  });

  it('is plan for an organization on a paid plan', async () => {
    expect(await service.resolve('org-1')).toBe('plan');
  });

  it('answers credits, not unmetered, when a read fails', async () => {
    isGated.fails = true;
    expect(await service.resolve('org-1')).toBe('credits');
  });
});
