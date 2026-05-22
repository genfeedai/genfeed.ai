import { ContentDraftsController } from '@api/collections/content-drafts/controllers/content-drafts.controller';
import { ContentDraftsService } from '@api/collections/content-drafts/services/content-drafts.service';
import { TrendsModule } from '@api/collections/trends/trends.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [ContentDraftsController],
  exports: [ContentDraftsService],
  imports: [forwardRef(() => TrendsModule)],
  providers: [ContentDraftsService],
})
export class ContentDraftsModule {}
