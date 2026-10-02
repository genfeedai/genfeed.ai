import { TemplatesModule } from '@api/collections/templates/templates.module';
import { CrunPromptBuilder } from '@api/services/prompt-builder/builders/crun-prompt.builder';
import { ReplicatePromptBuilder } from '@api/services/prompt-builder/builders/replicate-prompt.builder';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [PromptBuilderService],
  imports: [ConfigModule, LoggerModule, TemplatesModule],
  providers: [PromptBuilderService, ReplicatePromptBuilder, CrunPromptBuilder],
})
export class PromptBuilderModule {}
