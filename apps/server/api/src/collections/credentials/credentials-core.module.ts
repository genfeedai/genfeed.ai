import { AccountHealthService } from '@api/collections/credentials/services/account-health.service';
import { AccountPublishingContextService } from '@api/collections/credentials/services/account-publishing-context.service';
import { CredentialCryptoService } from '@api/collections/credentials/services/credential-crypto.service';
import { CredentialPostingTimesService } from '@api/collections/credentials/services/credential-posting-times.service';
import { CredentialPublishingReadinessService } from '@api/collections/credentials/services/credential-publishing-readiness.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { PublishingProviderSetupModule } from '@api/collections/publishing-setup/publishing-provider-setup.module';
import { SERVER_TOKENS } from '@api/index';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { Module } from '@nestjs/common';

const SERVER_CREDENTIAL_STORE_PROVIDER = {
  provide: SERVER_TOKENS.credentials,
  useExisting: CredentialsService,
};

/**
 * This module is a leaf that most of the graph imports, so it must not reach
 * back up it. `PublishingProviderSetupModule` has no imports of its own, so it
 * is safe to pull in directly; `QuotaService` is resolved through `ModuleRef`
 * inside `CredentialPublishingReadinessService` rather than imported here.
 */
@Module({
  exports: [
    AccountHealthService,
    AccountPublishingContextService,
    CredentialCryptoService,
    CredentialPostingTimesService,
    CredentialPublishingReadinessService,
    CredentialsService,
    SERVER_CREDENTIAL_STORE_PROVIDER,
  ],
  imports: [FilesClientModule, PublishingProviderSetupModule],
  providers: [
    AccountHealthService,
    AccountPublishingContextService,
    CredentialCryptoService,
    CredentialPostingTimesService,
    CredentialPublishingReadinessService,
    CredentialsService,
    SERVER_CREDENTIAL_STORE_PROVIDER,
  ],
})
export class CredentialsCoreModule {}
