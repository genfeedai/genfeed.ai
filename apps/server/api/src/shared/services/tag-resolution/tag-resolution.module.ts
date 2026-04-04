import { TagsModule } from '@api/collections/tags/tags.module';
import { TagResolutionService } from '@api/shared/services/tag-resolution/tag-resolution.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [TagResolutionService],
  imports: [TagsModule],
  providers: [TagResolutionService],
})
export class TagResolutionModule {}
