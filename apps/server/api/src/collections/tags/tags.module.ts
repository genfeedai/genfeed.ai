/**
 * Tags Module
 * Tagging system: create tags, manage tag categories, tag-based filtering,
and tag auto-suggestions.
 */
import { TagsController } from '@api/collections/tags/controllers/tags.controller';
import { TagsService } from '@api/collections/tags/services/tags.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [TagsController],
  exports: [TagsService],
  imports: [],
  providers: [TagsService],
})
export class TagsModule {}
