import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { PostGroupsController } from '@api/collections/post-groups/controllers/post-groups.controller';
import { PostGroupContractService } from '@api/collections/post-groups/services/post-group-contract.service';
import { PostGroupPersistenceService } from '@api/collections/post-groups/services/post-group-persistence.service';
import { PostGroupReadinessService } from '@api/collections/post-groups/services/post-group-readiness.service';
import { PostGroupRecurrenceService } from '@api/collections/post-groups/services/post-group-recurrence.service';
import { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import { PostLifecycleModule } from '@api/collections/posts/post-lifecycle.module';
import { PublishApprovalsModule } from '@api/collections/publish-approvals/publish-approvals.module';
import { PublishingProviderSetupModule } from '@api/collections/publishing-setup/publishing-provider-setup.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [PostGroupsController],
  // PostGroupPersistenceService is exported for the post-repurpose flow, which
  // creates draft channel targets and needs the shared group-status recalc.
  exports: [PostGroupPersistenceService, PostGroupsService],
  imports: [
    QueuesModule,
    // Readiness derivation is shared with every read surface. This is a
    // downward edge into a leaf, so it stays a plain import.
    CredentialsCoreModule,
    PostLifecycleModule,
    PublishApprovalsModule,
    PublishingProviderSetupModule,
  ],
  providers: [
    PostGroupContractService,
    PostGroupPersistenceService,
    PostGroupReadinessService,
    PostGroupsService,
    PostGroupRecurrenceService,
  ],
})
export class PostGroupsModule {}
