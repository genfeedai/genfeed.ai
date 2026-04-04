import { TemplatesModule } from '@api/collections/templates/templates.module';
import { ConfigModule } from '@api/config/config.module';
import { ReplicatePromptBuilder } from '@api/services/prompt-builder/builders/replicate-prompt.builder';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [PromptBuilderService],
  imports: [ConfigModule, LoggerModule, TemplatesModule],
  providers: [PromptBuilderService, ReplicatePromptBuilder],
})
export class PromptBuilderModule {}
