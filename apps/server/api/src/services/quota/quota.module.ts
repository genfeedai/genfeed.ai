import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { QuotaService } from '@api/services/quota/quota.service';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [QuotaService],
  imports: [
    forwardRef(() => CredentialsModule),
    forwardRef(() => OrganizationSettingsModule),
    forwardRef(() => OrganizationsModule),
  ],
  providers: [QuotaService],
})
export class QuotaModule {}
