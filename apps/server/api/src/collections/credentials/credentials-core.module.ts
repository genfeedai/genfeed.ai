import { AccountPublishingContextService } from '@api/collections/credentials/services/account-publishing-context.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [AccountPublishingContextService, CredentialsService],
  providers: [AccountPublishingContextService, CredentialsService],
})
export class CredentialsCoreModule {}
