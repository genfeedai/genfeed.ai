import { GenerationHarnessController } from '@api/services/harness/generation-harness.controller';
import { GenerationHarnessSettingsService } from '@api/services/harness/generation-harness-settings.service';
import { ContentHarnessModule } from '@api/services/harness/harness.module';
import { MediaPromptEnhancementService } from '@api/services/harness/media-prompt-enhancement.service';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [ContentHarnessModule, OpenRouterModule],
  controllers: [GenerationHarnessController],
  providers: [GenerationHarnessSettingsService, MediaPromptEnhancementService],
  exports: [GenerationHarnessSettingsService, MediaPromptEnhancementService],
})
export class MediaPromptEnhancementModule {}
