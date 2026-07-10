import { AccountHealthService } from '@api/collections/credentials/services/account-health.service';
import { AccountPublishingContextService } from '@api/collections/credentials/services/account-publishing-context.service';
import { CredentialCryptoService } from '@api/collections/credentials/services/credential-crypto.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [
    AccountHealthService,
    AccountPublishingContextService,
    CredentialCryptoService,
    CredentialsService,
  ],
  imports: [forwardRef(() => FilesClientModule)],
  providers: [
    AccountHealthService,
    AccountPublishingContextService,
    CredentialCryptoService,
    CredentialsService,
  ],
})
export class CredentialsCoreModule {}
