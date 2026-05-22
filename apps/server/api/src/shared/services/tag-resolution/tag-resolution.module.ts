import { TagsModule } from '@api/collections/tags/tags.module';
import { TagResolutionService } from '@api/shared/services/tag-resolution/tag-resolution.service';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [TagResolutionService],
  imports: [forwardRef(() => TagsModule)],
  providers: [TagResolutionService],
})
export class TagResolutionModule {}
