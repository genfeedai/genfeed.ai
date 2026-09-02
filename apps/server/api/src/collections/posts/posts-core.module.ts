import { CreditsModule } from '@api/collections/credits/credits.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { PostLifecycleModule } from '@api/collections/posts/post-lifecycle.module';
import { AnalyticsAggregationService } from '@api/collections/posts/services/analytics-aggregation.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { PublishApprovalsModule } from '@api/collections/publish-approvals/publish-approvals.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { Module } from '@nestjs/common';

/** Post persistence + aggregation. Generation HTTP stays on PostsModule. */
@Module({
  exports: [AnalyticsAggregationService, PostsService, PostLifecycleModule],
  imports: [
    CreditsModule,
    OrganizationSettingsModule,
    PostLifecycleModule,
    PublishApprovalsModule,
    QueuesModule,
  ],
  providers: [AnalyticsAggregationService, PostsService],
})
export class PostsCoreModule {}
