import { CredentialsController } from '@api/collections/credentials/controllers/credentials.controller';
import { CredentialsPublishingController } from '@api/collections/credentials/controllers/credentials-publishing.controller';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { CredentialPublishingOperationsService } from '@api/collections/credentials/services/credential-publishing-operations.service';
import { MODULE_METADATA } from '@nestjs/common/constants';

describe('CredentialsModule', () => {
  it('should be defined', () => {
    expect(CredentialsModule).toBeDefined();
  });

  it('registers the publishing controller before wildcard credential routes', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, CredentialsModule),
    ).toEqual([CredentialsPublishingController, CredentialsController]);
  });

  it('registers the bounded publishing operations service', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, CredentialsModule),
    ).toEqual([CredentialPublishingOperationsService]);
  });
});
