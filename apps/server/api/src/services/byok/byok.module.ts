import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import {
  OrganizationSetting,
  OrganizationSettingSchema,
} from '@api/collections/organization-settings/schemas/organization-setting.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { ByokService } from '@api/services/byok/byok.service';
import { ByokProviderFactoryService } from '@api/services/byok/byok-provider-factory.service';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  exports: [ByokProviderFactoryService, ByokService],
  imports: [
    HttpModule,
    OrganizationSettingsModule,
    MongooseModule.forFeature(
      [{ name: OrganizationSetting.name, schema: OrganizationSettingSchema }],
      DB_CONNECTIONS.AUTH,
    ),
  ],
  providers: [ByokProviderFactoryService, ByokService],
})
export class ByokModule {}
