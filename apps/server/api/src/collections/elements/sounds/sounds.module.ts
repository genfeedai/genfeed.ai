/**
 * Sounds Module
 * Sound effect library: audio effects, sound categories, sound mixing,
and audio asset management.
 */
import { ElementsSoundsController } from '@api/collections/elements/sounds/controllers/sounds.controller';
import { ElementsSoundsService } from '@api/collections/elements/sounds/services/sounds.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [ElementsSoundsController],
  exports: [ElementsSoundsService],
  imports: [],
  providers: [ElementsSoundsService],
})
export class ElementsSoundsModule {}
