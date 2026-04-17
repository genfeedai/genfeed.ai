import { ContentPlansService } from '@api/collections/content-plans/services/content-plans.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [ContentPlansService],
  imports: [],
  providers: [ContentPlansService],
})
export class ContentPlansModule {}
