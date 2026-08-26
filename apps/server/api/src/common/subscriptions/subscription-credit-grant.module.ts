/**
 * Credit-grant resolution only. Depends on `StripeCoreModule` (the Stripe
 * client leaf) rather than `StripeModule`, so billing collections and the
 * webhook handlers can both import it without closing a dependency ring.
 */
import { SubscriptionCreditGrantService } from '@api/common/subscriptions/subscription-credit-grant.service';
import { StripeCoreModule } from '@api/services/integrations/stripe/stripe-core.module';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [SubscriptionCreditGrantService],
  imports: [ConfigModule, LoggerModule, StripeCoreModule],
  providers: [SubscriptionCreditGrantService],
})
export class SubscriptionCreditGrantModule {}
