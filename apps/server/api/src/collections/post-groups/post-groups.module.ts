import { PostGroupsController } from '@api/collections/post-groups/controllers/post-groups.controller';
import { PostGroupContractService } from '@api/collections/post-groups/services/post-group-contract.service';
import { PostGroupPersistenceService } from '@api/collections/post-groups/services/post-group-persistence.service';
import { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import { PublishApprovalsModule } from '@api/collections/publish-approvals/publish-approvals.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [PostGroupsController],
  exports: [PostGroupsService],
  imports: [forwardRef(() => QueuesModule), PublishApprovalsModule],
  providers: [
    PostGroupContractService,
    PostGroupPersistenceService,
    PostGroupsService,
  ],
})
export class PostGroupsModule {}
