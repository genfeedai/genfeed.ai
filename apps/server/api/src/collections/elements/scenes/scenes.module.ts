/**
 * Scenes Module
 * Scene configurations: background settings, environmental presets,
scene composition, and scene templates.
 */
import { ElementsScenesController } from '@api/collections/elements/scenes/controllers/scenes.controller';
import { ElementsScenesService } from '@api/collections/elements/scenes/services/scenes.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [ElementsScenesController],
  exports: [ElementsScenesService],
  imports: [],
  providers: [ElementsScenesService],
})
export class ElementsScenesModule {}
