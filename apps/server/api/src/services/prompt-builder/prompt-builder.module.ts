import { TemplatesModule } from '@api/collections/templates/templates.module';
import { ReplicatePromptBuilder } from '@api/services/prompt-builder/builders/replicate-prompt.builder';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [PromptBuilderService],
  imports: [ConfigModule, LoggerModule, forwardRef(() => TemplatesModule)],
  providers: [PromptBuilderService, ReplicatePromptBuilder],
})
export class PromptBuilderModule {}
