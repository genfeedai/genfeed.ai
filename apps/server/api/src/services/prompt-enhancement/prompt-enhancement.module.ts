import { TemplatesModule } from '@api/collections/templates/templates.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { PromptEnhancementService } from '@api/services/prompt-enhancement/prompt-enhancement.service';
import { SkillRuntimeModule } from '@api/services/skill-runtime/skill-runtime.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [OpenRouterModule, TemplatesModule, SkillRuntimeModule],
  providers: [PromptEnhancementService],
  exports: [PromptEnhancementService],
})
export class PromptEnhancementModule {}
