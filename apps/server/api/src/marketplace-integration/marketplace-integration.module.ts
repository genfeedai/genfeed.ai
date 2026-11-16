import { BetterAuthModule } from '@api/auth/better-auth/better-auth.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { PromptsCoreModule } from '@api/collections/prompts/prompts-core.module';
import { SkillsModule } from '@api/collections/skills/skills.module';
import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { MarketplaceApiClient } from '@api/marketplace-integration/marketplace-api-client';
import { MarketplaceCreditPurchaseService } from '@api/marketplace-integration/marketplace-credit-purchase.service';
import { MarketplaceInstallController } from '@api/marketplace-integration/marketplace-install.controller';
import { MarketplaceInstallService } from '@api/marketplace-integration/marketplace-install.service';
import { MarketplacePurchaseController } from '@api/marketplace-integration/marketplace-purchase.controller';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [MarketplaceInstallController, MarketplacePurchaseController],
  exports: [MarketplaceApiClient, MarketplaceInstallService],
  imports: [
    BetterAuthModule,
    ConfigModule,
    CreditsModule,
    LoggerModule,
    PromptsCoreModule,
    WorkflowsCoreModule,
    SkillsModule,
  ],
  providers: [
    MarketplaceApiClient,
    MarketplaceCreditPurchaseService,
    MarketplaceInstallService,
  ],
})
export class MarketplaceIntegrationModule {}
