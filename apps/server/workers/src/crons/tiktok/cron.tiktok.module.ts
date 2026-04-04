import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { TiktokModule } from '@api/services/integrations/tiktok/tiktok.module';
import { forwardRef, Module } from '@nestjs/common';
import { CronTiktokStatusService } from '@workers/crons/tiktok/cron.tiktok-status.service';

@Module({
  imports: [
    forwardRef(() => CredentialsModule),
    forwardRef(() => PostsModule),
    forwardRef(() => TiktokModule),
  ],
  providers: [CronTiktokStatusService],
})
export class CronTiktokModule {}
