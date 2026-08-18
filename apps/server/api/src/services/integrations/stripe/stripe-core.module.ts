import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

/**
 * Stripe client only. Controllers that talk to billing stay on `StripeModule`
 * so this leaf never imports `SubscriptionsModule` and billing can depend on
 * the client without closing a ring (API-GENFEED-AI-60).
 */
@Module({
  exports: [StripeService],
  imports: [ConfigModule, LoggerModule],
  providers: [StripeService],
})
export class StripeCoreModule {}
