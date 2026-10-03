import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import {
  CreditsGuard,
  type CreditsGuardRequest,
} from '@api/helpers/guards/credits/credits.guard';
import { testModelCreditQuote } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import { BatchRewriteCreditsGuard } from '@api/services/batch-generation/batch-rewrite-credits.guard';
import type { ByokService } from '@api/services/byok/byok.service';
import { runtimeSettingsMock } from '@api-test/helpers/runtime-settings.mock';
import { ActivitySource, CreditReservationStatus } from '@genfeedai/contracts';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

describe('BatchRewriteCreditsGuard admission', () => {
  it.each([false, true])(
    'prices every distinct item and checks the balance without holding credits (JSON:API: %s)',
    async (isJsonApi) => {
      const credits = {
        checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
        reserveCredits: vi
          .fn()
          .mockImplementation(async ({ amount }: { amount: number }) => ({
            id: 'rewrite-reservation',
            amount,
            status: CreditReservationStatus.RESERVED,
          })),
      };
      const models = {
        findOne: vi.fn().mockResolvedValue({
          key: baseModelKey(DEFAULT_MINI_TEXT_MODEL),
          pricingType: 'per-token',
          minCost: 1,
        }),
      };
      const creditsGuard = new CreditsGuard(
        runtimeSettingsMock({ get: vi.fn() } as unknown as ConfigService),
        new Reflector(),
        credits as unknown as CreditsUtilsService,
        models as unknown as ModelsService,
        {
          isByokActiveForProvider: vi.fn().mockResolvedValue(false),
        } as unknown as ByokService,
        {
          debug: vi.fn(),
          log: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        } as unknown as LoggerService,
        testModelCreditQuote(models as never),
      );
      const attributes = {
        itemIds: ['item-1', 'item-2', 'item-1'],
        model: 'untrusted-model',
        outputs: 99,
      };
      const request = {
        body: isJsonApi ? { data: { attributes } } : attributes,
        user: { id: 'user-1', userId: 'user-1', organizationId: 'org-1' },
      } as unknown as CreditsGuardRequest;
      const context = {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;
      await expect(
        new BatchRewriteCreditsGuard(creditsGuard).canActivate(context),
      ).resolves.toBe(true);
      expect(models.findOne).toHaveBeenCalledWith({
        key: baseModelKey(DEFAULT_MINI_TEXT_MODEL),
      });
      expect(credits.checkOrganizationCreditsAvailable).toHaveBeenCalledWith(
        'org-1',
        2,
      );
      // The background job reserves and settles each item itself.
      expect(credits.reserveCredits).not.toHaveBeenCalled();
      expect(request.creditsConfig).toMatchObject({
        amount: 2,
        isReservationDeferred: true,
        modelKey: DEFAULT_MINI_TEXT_MODEL,
        source: ActivitySource.POST_ENHANCEMENT,
      });
      expect(request.creditsConfig?.reservationId).toBeUndefined();
      expect(request.body).toEqual(
        isJsonApi ? { data: { attributes } } : attributes,
      );
    },
  );

  it.each([
    [[]],
    [Array.from({ length: 101 }, (_, index) => `item-${index}`)],
    [[1]],
  ])(
    'rejects an out-of-range selection before pricing it (%#)',
    async (itemIds) => {
      const admit = vi.fn();
      const request = {
        body: { itemIds },
        user: { id: 'user-1', userId: 'user-1', organizationId: 'org-1' },
      } as unknown as CreditsGuardRequest;
      const context = {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;

      await expect(
        new BatchRewriteCreditsGuard({
          admit,
        } as unknown as CreditsGuard).canActivate(context),
      ).rejects.toThrow('Select between 1 and 100 batch items');
      expect(admit).not.toHaveBeenCalled();
    },
  );
});
