import { PostGroupsController } from '@api/collections/post-groups/controllers/post-groups.controller';
import { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import { QueuesModule } from '@api/queues/core/queues.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [PostGroupsController],
  exports: [PostGroupsService],
  imports: [forwardRef(() => QueuesModule)],
  providers: [PostGroupsService],
})
export class PostGroupsModule {}
