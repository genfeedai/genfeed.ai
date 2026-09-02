/**
 * Credit-grant resolution only. Depends on `StripeCoreModule` (the Stripe
 * client leaf) rather than `StripeModule`, so billing collections and the
 * webhook handlers can both import it without closing a dependency ring.
 */
import { SubscriptionCreditGrantService } from '@api/common/subscriptions/subscription-credit-grant.service';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { StripeCoreModule } from '@api/services/integrations/stripe/stripe-core.module';
import { ConfigModule } from '@libs/config/config.module';
import { ConfigService } from '@libs/config/config.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { LoggerService } from '@libs/logger/logger.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [SubscriptionCreditGrantService],
  imports: [ConfigModule, LoggerModule, StripeCoreModule],
  providers: [
    {
      inject: [ConfigService, LoggerService, StripeService],
      provide: SubscriptionCreditGrantService,
      useFactory: (
        configService: ConfigService,
        loggerService: LoggerService,
        stripeService: StripeService,
      ) =>
        new SubscriptionCreditGrantService(
          configService,
          loggerService,
          stripeService,
        ),
    },
  ],
})
export class SubscriptionCreditGrantModule {}
