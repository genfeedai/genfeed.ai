import { CreditsModule } from '@api/collections/credits/credits.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { PostLifecycleModule } from '@api/collections/posts/post-lifecycle.module';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { PublishApprovalsModule } from '@api/collections/publish-approvals/publish-approvals.module';
import { Module } from '@nestjs/common';

/** Post persistence only. Generation/analytics HTTP stays on PostsModule. */
@Module({
  exports: [PostsService, PostLifecycleModule],
  imports: [
    CreditsModule,
    OrganizationSettingsModule,
    PostLifecycleModule,
    PublishApprovalsModule,
  ],
  providers: [PostsService],
})
export class PostsCoreModule {}
