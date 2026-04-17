/**
 * Moods Module
 * Content mood settings: emotional tone configurations, mood-based generation,
and mood library management.
 */
import { ElementsMoodsController } from '@api/collections/elements/moods/controllers/moods.controller';
import { ElementsMoodsService } from '@api/collections/elements/moods/services/moods.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [ElementsMoodsController],
  exports: [ElementsMoodsService],
  imports: [],
  providers: [ElementsMoodsService],
})
export class ElementsMoodsModule {}
