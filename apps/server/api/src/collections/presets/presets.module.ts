/**
 * Presets Module
 * Saved PromptBar configurations: stores prompt text + style + mood + camera + scene
 * as reusable presets. Users select preset → all PromptBar values auto-fill.
 * NOTE: Different from Templates (which are prompt templates with {{variables}}).
 */
import { MembersModule } from '@api/collections/members/members.module';
import { PresetsController } from '@api/collections/presets/controllers/presets.controller';
import { PresetsService } from '@api/collections/presets/services/presets.service';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [PresetsController],
  exports: [PresetsService],
  imports: [forwardRef(() => MembersModule)],
  providers: [PresetsService],
})
export class PresetsModule {}
