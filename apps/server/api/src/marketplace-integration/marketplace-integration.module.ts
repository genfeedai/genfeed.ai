import { PromptsCoreModule } from '@api/collections/prompts/prompts-core.module';
import { SkillsModule } from '@api/collections/skills/skills.module';
import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { MarketplaceApiClient } from '@api/marketplace-integration/marketplace-api-client';
import { MarketplaceInstallController } from '@api/marketplace-integration/marketplace-install.controller';
import { MarketplaceInstallService } from '@api/marketplace-integration/marketplace-install.service';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [MarketplaceInstallController],
  exports: [MarketplaceApiClient, MarketplaceInstallService],
  imports: [
    ConfigModule,
    LoggerModule,
    PromptsCoreModule,
    WorkflowsCoreModule,
    SkillsModule,
  ],
  providers: [MarketplaceApiClient, MarketplaceInstallService],
})
export class MarketplaceIntegrationModule {}
