import { ContentLearningCoreModule } from '@api/collections/content-learning/content-learning-core.module';
import { PostsCoreModule } from '@api/collections/posts/posts-core.module';
import { AiActionsController } from '@api/endpoints/ai-actions/ai-actions.controller';
import { AiActionsService } from '@api/endpoints/ai-actions/ai-actions.service';
import { BrandedContentActionsService } from '@api/endpoints/ai-actions/branded-content-actions.service';
import { BrandedTextActionsService } from '@api/endpoints/ai-actions/branded-text-actions.service';
import { BrandedTextRunnerService } from '@api/endpoints/ai-actions/branded-text-runner.service';
import { AgentContextAssemblyModule } from '@api/services/agent-context-assembly/agent-context-assembly.module';
import { AgentChatModelRegistryModule } from '@api/services/agent-orchestrator/agent-chat-model-registry.module';
import { BrandedGenerationReceiptsModule } from '@api/services/branded-generation-receipts/branded-generation-receipts.module';
import { BrandedTextGenerationModule } from '@api/services/branded-text-generation/branded-text-generation.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { PromptEnhancementModule } from '@api/services/prompt-enhancement/prompt-enhancement.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AiActionsController],
  exports: [
    AiActionsService,
    BrandedContentActionsService,
    BrandedTextActionsService,
  ],
  imports: [
    PromptEnhancementModule,
    AgentChatModelRegistryModule,
    AgentContextAssemblyModule,
    BrandedGenerationReceiptsModule,
    BrandedTextGenerationModule,
    ByokModule,
    ContentLearningCoreModule,
    LoggerModule,
    OpenRouterModule,
    PostsCoreModule,
  ],
  providers: [
    AiActionsService,
    BrandedContentActionsService,
    BrandedTextActionsService,
    BrandedTextRunnerService,
  ],
})
export class AiActionsModule {}
