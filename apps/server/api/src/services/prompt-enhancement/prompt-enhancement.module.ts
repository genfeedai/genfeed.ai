import { PromptsCoreModule } from '@api/collections/prompts/prompts-core.module';
import { TemplatesModule } from '@api/collections/templates/templates.module';
import { AgentChatModelRegistryModule } from '@api/services/agent-orchestrator/agent-chat-model-registry.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { PromptEnhancementService } from '@api/services/prompt-enhancement/prompt-enhancement.service';
import { SkillRuntimeModule } from '@api/services/skill-runtime/skill-runtime.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    AgentChatModelRegistryModule,
    PromptsCoreModule,
    OpenRouterModule,
    TemplatesModule,
    SkillRuntimeModule,
  ],
  providers: [PromptEnhancementService],
  exports: [PromptEnhancementService],
})
export class PromptEnhancementModule {}
