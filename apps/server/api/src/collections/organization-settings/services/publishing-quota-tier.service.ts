import { FreeTrialService } from '@api/collections/credits/services/free-trial.service';
import { OrganizationPaidAccessService } from '@api/common/subscriptions/organization-paid-access.service';
import { hasOrganizationBilling } from '@genfeedai/config';
import type { PublishingQuotaTier } from '@genfeedai/contracts/constants';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

/**
 * What an organization has paid, as far as daily publishing caps care.
 *
 * - no organization billing (self-hosted): `unmetered`, the owner's caps stand;
 * - never paid, no operator comp: `trial`, 1 post a day per account;
 * - a paid plan: `plan`;
 * - anything else that paid or was comped (a credit pack, a warm-up workspace,
 *   an operator grant): `credits`.
 *
 * "Never paid" is the free-trial reading (`FreeTrialService.getState`): a trial
 * end date means no paid grant, subscription or operator comp exists. The two
 * services are reached through `ModuleRef` because this runs in the API and in
 * the workers, which hold them in different modules.
 */
@Traced()
@Injectable()
export class PublishingQuotaTierService {
  private readonly context = { service: PublishingQuotaTierService.name };

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly logger: LoggerService,
  ) {}

  /**
   * The tier of one organization. A read that fails answers `credits`: a
   * transient fault must neither block a paying customer nor open the
   * unmetered path.
   */
  async resolve(organizationId: string): Promise<PublishingQuotaTier> {
    if (!hasOrganizationBilling()) return 'unmetered';
    try {
      const freeTrial = this.moduleRef.get(FreeTrialService, { strict: false });
      const state = await freeTrial.getState(organizationId);
      if (state.trialEndsAt !== null) return 'trial';

      const paidAccess = this.moduleRef.get(OrganizationPaidAccessService, {
        strict: false,
      });
      return (await paidAccess.isSubscriptionGatedFresh(organizationId))
        ? 'credits'
        : 'plan';
    } catch (error: unknown) {
      this.logger.warn('Publishing quota tier could not be read', {
        ...this.context,
        error: error instanceof Error ? error.message : String(error),
        organizationId,
      });
      return 'credits';
    }
  }
}
