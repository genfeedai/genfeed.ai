import type { ISubscriptionAttributionsService } from '@genfeedai/contracts/interfaces/billing';
import { Injectable } from '@nestjs/common';

/**
 * Community no-op implementation of {@link ISubscriptionAttributionsService}.
 *
 * Bound to the `SUBSCRIPTION_ATTRIBUTIONS_SERVICE` token when organization
 * billing is not live at runtime. `trackSubscription` runs on the always-on
 * Stripe webhook path, so it returns `null` and NEVER throws — attribution
 * analytics is a cloud billing concern and its absence must not break webhook
 * delivery.
 */
@Injectable()
export class OssSubscriptionAttributionsService
  implements ISubscriptionAttributionsService
{
  async trackSubscription(
    _dto: unknown,
    _organizationId: string,
  ): Promise<unknown> {
    return null;
  }
}
