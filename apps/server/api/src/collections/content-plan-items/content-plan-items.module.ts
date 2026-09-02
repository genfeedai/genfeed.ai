import { ContentPlanItemsService } from '@api/collections/content-plan-items/services/content-plan-items.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [ContentPlanItemsService],
  imports: [],
  providers: [ContentPlanItemsService],
})
export class ContentPlanItemsModule {}
