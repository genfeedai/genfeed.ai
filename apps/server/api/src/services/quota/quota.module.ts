import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { QuotaService } from '@api/services/quota/quota.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [QuotaService],
  imports: [
    CredentialsCoreModule,
    OrganizationSettingsModule,
    OrganizationsModule,
  ],
  providers: [QuotaService],
})
export class QuotaModule {}
