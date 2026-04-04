/**
 * Organization Settings Module
 * Organization-level settings: org preferences, default configurations,
branding settings, and feature flags.
 */

import { ModelsModule } from '@api/collections/models/models.module';
import {
  OrganizationSetting,
  OrganizationSettingSchema,
} from '@api/collections/organization-settings/schemas/organization-setting.schema';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [],
  exports: [MongooseModule, OrganizationSettingsService],
  imports: [
    forwardRef(() => ModelsModule),
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: OrganizationSetting.name,
          useFactory: () => {
            const schema = OrganizationSettingSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.AUTH,
    ),
  ],
  providers: [OrganizationSettingsService],
})
export class OrganizationSettingsModule {}
