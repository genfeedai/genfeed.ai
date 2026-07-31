import { AccountHealthService } from '@api/collections/credentials/services/account-health.service';
import { AccountPublishingContextService } from '@api/collections/credentials/services/account-publishing-context.service';
import { CredentialCryptoService } from '@api/collections/credentials/services/credential-crypto.service';
import { CredentialPublishingReadinessService } from '@api/collections/credentials/services/credential-publishing-readiness.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { PublishingProviderSetupModule } from '@api/collections/publishing-setup/publishing-provider-setup.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { QuotaModule } from '@api/services/quota/quota.module';
import { forwardRef, Module } from '@nestjs/common';

/**
 * `PublishingProviderSetupModule` has no imports of its own, so it is safe to
 * pull in directly. `QuotaModule` already reaches back here through a
 * `forwardRef`, so this side is guarded too.
 */
@Module({
  exports: [
    AccountHealthService,
    AccountPublishingContextService,
    CredentialCryptoService,
    CredentialPublishingReadinessService,
    CredentialsService,
  ],
  imports: [
    forwardRef(() => FilesClientModule),
    forwardRef(() => QuotaModule),
    PublishingProviderSetupModule,
  ],
  providers: [
    AccountHealthService,
    AccountPublishingContextService,
    CredentialCryptoService,
    CredentialPublishingReadinessService,
    CredentialsService,
  ],
})
export class CredentialsCoreModule {}
