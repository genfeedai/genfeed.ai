import { PromptsModule } from '@api/collections/prompts/prompts.module';
import { SkillsModule } from '@api/collections/skills/skills.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { ConfigModule } from '@api/config/config.module';
import { MarketplaceApiClient } from '@api/marketplace-integration/marketplace-api-client';
import { MarketplaceInstallController } from '@api/marketplace-integration/marketplace-install.controller';
import { MarketplaceInstallService } from '@api/marketplace-integration/marketplace-install.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [MarketplaceInstallController],
  exports: [MarketplaceApiClient, MarketplaceInstallService],
  imports: [
    ConfigModule,
    LoggerModule,
    forwardRef(() => PromptsModule),
    forwardRef(() => WorkflowsModule),
    SkillsModule,
  ],
  providers: [MarketplaceApiClient, MarketplaceInstallService],
})
export class MarketplaceIntegrationModule {}
