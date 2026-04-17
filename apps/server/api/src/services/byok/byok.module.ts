import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { ByokService } from '@api/services/byok/byok.service';
import { ByokProviderFactoryService } from '@api/services/byok/byok-provider-factory.service';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  exports: [ByokProviderFactoryService, ByokService],
  imports: [HttpModule, OrganizationSettingsModule],
  providers: [ByokProviderFactoryService, ByokService],
})
export class ByokModule {}
