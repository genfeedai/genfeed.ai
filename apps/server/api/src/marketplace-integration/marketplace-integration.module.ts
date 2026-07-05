import { PromptsModule } from '@api/collections/prompts/prompts.module';
import { SkillsModule } from '@api/collections/skills/skills.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { MarketplaceApiClient } from '@api/marketplace-integration/marketplace-api-client';
import { MarketplaceInstallController } from '@api/marketplace-integration/marketplace-install.controller';
import { MarketplaceInstallService } from '@api/marketplace-integration/marketplace-install.service';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [MarketplaceInstallController],
  exports: [MarketplaceApiClient, MarketplaceInstallService],
  imports: [
    forwardRef(() => ConfigModule),
    forwardRef(() => LoggerModule),
    forwardRef(() => PromptsModule),
    forwardRef(() => WorkflowsModule),
    forwardRef(() => SkillsModule),
  ],
  providers: [MarketplaceApiClient, MarketplaceInstallService],
})
export class MarketplaceIntegrationModule {}
