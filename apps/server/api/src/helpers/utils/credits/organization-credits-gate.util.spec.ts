import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { HttpException, HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assertOrganizationCreditsAvailable,
  getDefaultTextMinimumCredits,
  resolveTextModelMinimumCredits,
} from './organization-credits-gate.util';

describe('assertOrganizationCreditsAvailable', () => {
  const creditsUtilsService = {
    checkOrganizationCreditsAvailable: vi.fn(),
    getOrganizationCreditsBalance: vi.fn(),
  };

  beforeEach(() => {
    creditsUtilsService.checkOrganizationCreditsAvailable.mockReset();
    creditsUtilsService.getOrganizationCreditsBalance.mockReset();
  });

  it('skips the balance lookup when no credits are required', async () => {
    await assertOrganizationCreditsAvailable(creditsUtilsService, 'org_1', 0);

    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).not.toHaveBeenCalled();
    expect(
      creditsUtilsService.getOrganizationCreditsBalance,
    ).not.toHaveBeenCalled();
  });

  it('throws when the organization id is missing', async () => {
    await expect(
      assertOrganizationCreditsAvailable(creditsUtilsService, '', 12),
    ).rejects.toMatchObject({ message: 'Organization is required' });

    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).not.toHaveBeenCalled();
  });

  it('returns when the organization has enough credits', async () => {
    creditsUtilsService.checkOrganizationCreditsAvailable.mockResolvedValue(
      true,
    );

    await assertOrganizationCreditsAvailable(creditsUtilsService, 'org_1', 12);

    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).toHaveBeenCalledWith('org_1', 12);
    expect(
      creditsUtilsService.getOrganizationCreditsBalance,
    ).not.toHaveBeenCalled();
  });

  it('throws the shared 402 payload when credits are insufficient', async () => {
    creditsUtilsService.checkOrganizationCreditsAvailable.mockResolvedValue(
      false,
    );
    creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(4);

    const error = await assertOrganizationCreditsAvailable(
      creditsUtilsService,
      'org_1',
      12,
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(
      HttpStatus.PAYMENT_REQUIRED,
    );
    expect((error as HttpException).getResponse()).toEqual({
      detail: 'Insufficient credits: 12 required, 4 available',
      title: 'Insufficient credits',
    });
    expect(
      creditsUtilsService.getOrganizationCreditsBalance,
    ).toHaveBeenCalledWith('org_1');
  });
});

describe('resolveTextModelMinimumCredits', () => {
  const modelsService = {
    findOne: vi.fn(),
  };

  beforeEach(() => {
    modelsService.findOne.mockReset();
  });

  it('returns 0 when no model key is provided', async () => {
    await expect(resolveTextModelMinimumCredits(modelsService)).resolves.toBe(
      0,
    );
    expect(modelsService.findOne).not.toHaveBeenCalled();
  });

  it('returns 0 when the model is missing', async () => {
    modelsService.findOne.mockResolvedValue(null);

    await expect(
      resolveTextModelMinimumCredits(modelsService, 'missing-model'),
    ).resolves.toBe(0);
    expect(modelsService.findOne).toHaveBeenCalledWith({
      key: baseModelKey('missing-model'),
    });
  });

  it('uses getMinimumTextCredits for per-token models', async () => {
    modelsService.findOne.mockResolvedValue({
      cost: 40,
      minCost: 7,
      pricingType: 'per-token',
    });

    await expect(
      resolveTextModelMinimumCredits(modelsService, 'text-model'),
    ).resolves.toBe(1);
  });

  it('uses model.cost for non-per-token models and ignores minCost', async () => {
    modelsService.findOne.mockResolvedValue({
      cost: 25,
      minCost: 7,
      pricingType: 'flat',
    });

    await expect(
      resolveTextModelMinimumCredits(modelsService, 'text-model'),
    ).resolves.toBe(25);
  });

  it('returns 0 when a non-per-token model has no cost', async () => {
    modelsService.findOne.mockResolvedValue({
      cost: null,
      minCost: 7,
      pricingType: 'flat',
    });

    await expect(
      resolveTextModelMinimumCredits(modelsService, 'text-model'),
    ).resolves.toBe(0);
  });
});

describe('getDefaultTextMinimumCredits', () => {
  it('looks up the default text model', async () => {
    const modelsService = {
      findOne: vi.fn().mockResolvedValue({
        cost: 18,
        pricingType: 'flat',
      }),
    };

    await expect(getDefaultTextMinimumCredits(modelsService)).resolves.toBe(18);
    expect(modelsService.findOne).toHaveBeenCalledWith({
      key: baseModelKey(DEFAULT_TEXT_MODEL),
    });
  });
});
