import type { ISubscriptionAttributionsService } from '@genfeedai/interfaces/billing';
import { Injectable } from '@nestjs/common';

/**
 * OSS no-op implementation of {@link ISubscriptionAttributionsService}.
 *
 * Bound to the `SUBSCRIPTION_ATTRIBUTIONS_SERVICE` token when no enterprise
 * license is present. `trackSubscription` runs on the always-on Stripe webhook
 * path, so it returns `null` and NEVER throws — attribution analytics is an
 * enterprise concern and its absence must not break webhook delivery.
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
