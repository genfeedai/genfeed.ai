import { GenerationHarnessController } from '@api/services/harness/generation-harness.controller';
import { GenerationHarnessSettingsService } from '@api/services/harness/generation-harness-settings.service';
import { ContentHarnessModule } from '@api/services/harness/harness.module';
import { MediaPromptEnhancementService } from '@api/services/harness/media-prompt-enhancement.service';
import { PromptEnhancementModule } from '@api/services/prompt-enhancement/prompt-enhancement.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [ContentHarnessModule, PromptEnhancementModule, LoggerModule],
  controllers: [GenerationHarnessController],
  providers: [GenerationHarnessSettingsService, MediaPromptEnhancementService],
  exports: [GenerationHarnessSettingsService, MediaPromptEnhancementService],
})
export class MediaPromptEnhancementModule {}
