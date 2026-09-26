import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { OrganizationPaidAccessModule } from '@api/common/subscriptions/organization-paid-access.module';
import { SERVER_TOKENS } from '@api/server.dependencies';
import { ByokService } from '@api/services/byok/byok.service';
import { ByokProviderFactoryService } from '@api/services/byok/byok-provider-factory.service';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const SERVER_BYOK_RESOLVER_PROVIDER = {
  provide: SERVER_TOKENS.byok,
  useExisting: ByokService,
};

@Module({
  exports: [
    ByokProviderFactoryService,
    ByokService,
    SERVER_BYOK_RESOLVER_PROVIDER,
  ],
  imports: [
    HttpModule,
    OrganizationPaidAccessModule,
    OrganizationSettingsModule,
  ],
  providers: [
    ByokProviderFactoryService,
    ByokService,
    SERVER_BYOK_RESOLVER_PROVIDER,
  ],
})
export class ByokModule {}
