import { PostGroupsController } from '@api/collections/post-groups/controllers/post-groups.controller';
import { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [PostGroupsController],
  exports: [PostGroupsService],
  providers: [PostGroupsService],
})
export class PostGroupsModule {}
