import { StudioGenerateDraftsController } from '@api/collections/studio-generate-drafts/controllers/studio-generate-drafts.controller';
import { StudioGenerateDraftsService } from '@api/collections/studio-generate-drafts/services/studio-generate-drafts.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [StudioGenerateDraftsController],
  exports: [StudioGenerateDraftsService],
  providers: [StudioGenerateDraftsService],
})
export class StudioGenerateDraftsModule {}
