import { Module } from '@nestjs/common';
import { CronCredentialsService } from '@workers/crons/credentials/cron.credentials.service';
import { SocialIntegrationsModule } from '@workers/services/social-integrations.module';
import { WorkersDomainModule } from '@server/workers-domain.module';

@Module({
  imports: [
    WorkersDomainModule,
    SocialIntegrationsModule,
  ],
  providers: [CronCredentialsService],
})
export class CronCredentialsModule {}
