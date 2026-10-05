import { ModelsModule } from '@api/collections/models/models.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { PromptBuilderModule } from '@api/services/prompt-builder/prompt-builder.module';
import { AgentGenerationEstimateService } from '@api/services/router/agent-generation-estimate.service';
import { RouterController } from '@api/services/router/router.controller';
import { RouterService } from '@api/services/router/router.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [RouterController],
  exports: [RouterService, AgentGenerationEstimateService],
  imports: [
    LoggerModule,
    ModelsModule,
    OrganizationSettingsModule,
    PromptBuilderModule,
  ],
  providers: [RouterService, AgentGenerationEstimateService],
})
export class RouterModule {}
