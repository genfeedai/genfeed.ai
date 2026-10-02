import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { OrganizationPaidAccessModule } from '@api/common/subscriptions/organization-paid-access.module';
import { SERVER_TOKENS } from '@api/server.dependencies';
import { ByokService } from '@api/services/byok/byok.service';
import { ByokProviderFactoryService } from '@api/services/byok/byok-provider-factory.service';
import { TextGenerationCreditsService } from '@api/services/byok/text-generation-credits.service';
import { CacheModule } from '@api/services/cache/cache.module';
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
    TextGenerationCreditsService,
  ],
  imports: [
    CacheModule,
    HttpModule,
    OrganizationPaidAccessModule,
    OrganizationSettingsModule,
  ],
  providers: [
    ByokProviderFactoryService,
    ByokService,
    SERVER_BYOK_RESOLVER_PROVIDER,
    TextGenerationCreditsService,
  ],
})
export class ByokModule {}
