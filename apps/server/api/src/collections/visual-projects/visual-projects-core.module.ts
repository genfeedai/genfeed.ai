import { CreditsModule } from '@api/collections/credits/credits.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { VisualProjectAssetsService } from '@api/collections/visual-projects/services/visual-project-assets.service';
import { VisualProjectAuthoringService } from '@api/collections/visual-projects/services/visual-project-authoring.service';
import { VisualProjectAuthorizationService } from '@api/collections/visual-projects/services/visual-project-authorization.service';
import { VisualProjectBillingService } from '@api/collections/visual-projects/services/visual-project-billing.service';
import { VisualProjectDispatchService } from '@api/collections/visual-projects/services/visual-project-dispatch.service';
import { VisualProjectRendererClientService } from '@api/collections/visual-projects/services/visual-project-renderer-client.service';
import { VisualProjectWorkflowService } from '@api/collections/visual-projects/services/visual-project-workflow.service';
import { VisualProjectsService } from '@api/collections/visual-projects/services/visual-projects.service';
import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { OrganizationModuleAccessModule } from '@api/common/organization-modules/organization-module-access.module';
import { AgentChatModelRegistryModule } from '@api/services/agent-orchestrator/agent-chat-model-registry.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { SharedModule } from '@api/shared/shared.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    CreditsModule,
    IngredientsModule,
    WorkflowsCoreModule,
    OrganizationModuleAccessModule,
    AgentChatModelRegistryModule,
    ByokModule,
    LlmDispatcherModule,
    SharedModule,
  ],
  providers: [
    VisualProjectDispatchService,
    VisualProjectAuthorizationService,
    VisualProjectAssetsService,
    VisualProjectBillingService,
    VisualProjectAuthoringService,
    VisualProjectRendererClientService,
    VisualProjectWorkflowService,
    VisualProjectsService,
  ],
  exports: [VisualProjectsService],
})
export class VisualProjectsCoreModule {}
