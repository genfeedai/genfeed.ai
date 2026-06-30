import { AccountPublishingContextService } from '@api/collections/credentials/services/account-publishing-context.service';
import { CredentialCryptoService } from '@api/collections/credentials/services/credential-crypto.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [
    AccountPublishingContextService,
    CredentialCryptoService,
    CredentialsService,
  ],
  providers: [
    AccountPublishingContextService,
    CredentialCryptoService,
    CredentialsService,
  ],
})
export class CredentialsCoreModule {}
