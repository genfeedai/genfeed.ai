import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { PublishersModule } from '@api/services/integrations/publishers/publishers.module';
import { QuotaModule } from '@api/services/quota/quota.module';
import { forwardRef, Module } from '@nestjs/common';
import { CronPostsService } from '@workers/crons/posts/cron.posts.service';

@Module({
  imports: [
    forwardRef(() => ActivitiesModule),
    forwardRef(() => CredentialsModule),
    forwardRef(() => OrganizationsModule),
    forwardRef(() => PostsModule),
    PublishersModule,
    QuotaModule,
  ],
  providers: [CronPostsService],
})
export class CronPostsModule {}
