import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { Module } from '@nestjs/common';

/** Prompt persistence only. Marketplace install imports this, not PromptsModule. */
@Module({
  exports: [PromptsService],
  providers: [PromptsService],
})
export class PromptsCoreModule {}
