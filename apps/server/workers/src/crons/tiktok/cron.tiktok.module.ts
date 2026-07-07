import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { SystemWorkflowProvenanceService } from '@api/collections/workflows/services/system-workflow-provenance.service';
import { TiktokModule } from '@api/services/integrations/tiktok/tiktok.module';
import { WebhookClientModule } from '@api/services/webhook-client/webhook-client.module';
import { forwardRef, Module } from '@nestjs/common';
import { CronTiktokStatusService } from '@workers/crons/tiktok/cron.tiktok-status.service';

@Module({
  imports: [
    forwardRef(() => CredentialsModule),
    forwardRef(() => PostsModule),
    forwardRef(() => WebhookClientModule),
    forwardRef(() => TiktokModule),
  ],
  exports: [CronTiktokStatusService],
  providers: [CronTiktokStatusService, SystemWorkflowProvenanceService],
})
export class CronTiktokModule {}
