import { PostGroupsController } from '@api/collections/post-groups/controllers/post-groups.controller';
import { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import { PublishApprovalsModule } from '@api/collections/publish-approvals/publish-approvals.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [PostGroupsController],
  exports: [PostGroupsService],
  imports: [forwardRef(() => QueuesModule), PublishApprovalsModule],
  providers: [PostGroupsService],
})
export class PostGroupsModule {}
