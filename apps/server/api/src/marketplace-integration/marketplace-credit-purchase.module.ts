import { BetterAuthModule } from '@api/auth/better-auth/better-auth.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { MarketplaceCreditPurchaseService } from '@api/marketplace-integration/marketplace-credit-purchase.service';
import { MarketplaceIntegrationModule } from '@api/marketplace-integration/marketplace-integration.module';
import { MarketplacePurchaseController } from '@api/marketplace-integration/marketplace-purchase.controller';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

/**
 * Paying for a marketplace listing with credits. Kept apart from
 * MarketplaceIntegrationModule because signing the service token needs
 * BetterAuthModule, and that module reaches back into
 * MarketplaceIntegrationModule through BrandsModule -> PromptsModule.
 */
@Module({
  controllers: [MarketplacePurchaseController],
  imports: [
    BetterAuthModule,
    ConfigModule,
    CreditsModule,
    LoggerModule,
    MarketplaceIntegrationModule,
  ],
  providers: [MarketplaceCreditPurchaseService],
})
export class MarketplaceCreditPurchaseModule {}
