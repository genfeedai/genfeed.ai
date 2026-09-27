import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import {
  CreditsGuard,
  type CreditsGuardRequest,
} from '@api/helpers/guards/credits/credits.guard';
import { BatchRewriteCreditsGuard } from '@api/services/batch-generation/batch-rewrite-credits.guard';
import { BatchAction } from '@api/services/batch-generation/dto/batch-action.dto';
import type { ByokService } from '@api/services/byok/byok.service';
import { ActivitySource, CreditReservationStatus } from '@genfeedai/contracts';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

describe('BatchRewriteCreditsGuard reservation handoff', () => {
  it.each([false, true])(
    'preserves real admission pricing and reservation on the original request (JSON:API: %s)',
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
        { get: vi.fn() } as unknown as ConfigService,
      );
      const attributes = {
        action: BatchAction.REWRITE,
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
      expect(credits.reserveCredits).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 2,
          actorUserId: 'user-1',
          organizationId: 'org-1',
        }),
      );
      expect(request.creditsConfig).toMatchObject({
        amount: 2,
        modelKey: DEFAULT_MINI_TEXT_MODEL,
        reservationId: 'rewrite-reservation',
        source: ActivitySource.POST_ENHANCEMENT,
      });
      expect(request.body).toEqual(
        isJsonApi ? { data: { attributes } } : attributes,
      );
    },
  );
});
