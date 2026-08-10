import type {
  IUserSubscriptionOssReadModel,
  IUserSubscriptionsService,
} from '@genfeedai/interfaces/billing';
import { ForbiddenException, Injectable } from '@nestjs/common';

function enterpriseBillingUnavailable(): never {
  throw new ForbiddenException(
    'Organization subscription billing is not available on this API. ' +
      'This build bundles the OSS billing stub — a hosted *.genfeed.ai API must be built from an image containing ee/packages/billing ' +
      '(docker/Dockerfile.server; verify with `bun run check:billing-flavor`) AND run with GENFEED_CLOUD=true. ' +
      'Self-hosted community builds use managed credits checkout instead of org Stripe subscriptions. ' +
      'See docs/deployment-modes.md#build-flavors.',
  );
}

/**
 * OSS no-op implementation of {@link IUserSubscriptionsService}.
 *
 * Bound to the `USER_SUBSCRIPTIONS_SERVICE` token when no enterprise license is
 * present.
 *
 * - `findByUser` (read path) and `updateFromStripeSession` (always-on webhook)
 *   return domain-safe values and NEVER throw.
 * - `getOrCreateSubscription` (user-initiated checkout) THROWS
 *   `ForbiddenException`, mirroring `OssSubscriptionsService.createForOrganization`.
 */
@Injectable()
export class OssUserSubscriptionsService implements IUserSubscriptionsService {
  async findByUser(
    _userId: string,
  ): Promise<IUserSubscriptionOssReadModel | null> {
    return null;
  }

  async getOrCreateSubscription(
    _userId: string,
  ): Promise<IUserSubscriptionOssReadModel> {
    return enterpriseBillingUnavailable();
  }

  async updateFromStripeSession(
    _userId: string,
    _session: unknown,
  ): Promise<IUserSubscriptionOssReadModel | null> {
    return null;
  }
}
