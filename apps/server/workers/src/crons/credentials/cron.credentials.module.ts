import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { forwardRef, Module } from '@nestjs/common';
import { CronCredentialsService } from '@workers/crons/credentials/cron.credentials.service';
import { SocialIntegrationsModule } from '@workers/services/social-integrations.module';

@Module({
  exports: [CronCredentialsService],
  imports: [forwardRef(() => CredentialsModule), SocialIntegrationsModule],
  providers: [CronCredentialsService],
})
export class CronCredentialsModule {}
