/**
 * Settings Module
 * User settings: preferences, notifications, theme settings,
and personalization options.
 */

import {
  Setting,
  SettingSchema,
} from '@api/collections/settings/schemas/setting.schema';
import { SettingsService } from '@api/collections/settings/services/settings.service';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [],
  exports: [MongooseModule, SettingsService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: Setting.name,
          useFactory: () => {
            const schema = SettingSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.AUTH,
    ),
  ],
  providers: [SettingsService],
})
export class SettingsModule {}
