import { BrandedGenerationReceiptsModule } from '@api/services/branded-generation-receipts/branded-generation-receipts.module';
import { BrandedTextGenerationModule } from '@api/services/branded-text-generation/branded-text-generation.module';
import { GenerationHarnessController } from '@api/services/harness/generation-harness.controller';
import { GenerationHarnessSettingsService } from '@api/services/harness/generation-harness-settings.service';
import { ContentHarnessModule } from '@api/services/harness/harness.module';
import { MediaPromptEnhancementService } from '@api/services/harness/media-prompt-enhancement.service';
import { PromptEnhancementModule } from '@api/services/prompt-enhancement/prompt-enhancement.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    BrandedGenerationReceiptsModule,
    BrandedTextGenerationModule,
    ContentHarnessModule,
    PromptEnhancementModule,
    LoggerModule,
  ],
  controllers: [GenerationHarnessController],
  providers: [GenerationHarnessSettingsService, MediaPromptEnhancementService],
  exports: [GenerationHarnessSettingsService, MediaPromptEnhancementService],
})
export class MediaPromptEnhancementModule {}
