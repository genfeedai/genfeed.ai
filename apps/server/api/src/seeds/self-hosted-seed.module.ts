/**
 * Self-Hosted Seed Module
 * Registers Mongoose models required by the seed service and provides
 * SelfHostedSeedService, which creates the default workspace on first boot
 * when running in self-hosted mode (no Clerk).
 */

import {
  Brand,
  BrandSchema,
} from '@api/collections/brands/schemas/brand.schema';
import {
  OrganizationSetting,
  OrganizationSettingSchema,
} from '@api/collections/organization-settings/schemas/organization-setting.schema';
import {
  Organization,
  OrganizationSchema,
} from '@api/collections/organizations/schemas/organization.schema';
import { User, UserSchema } from '@api/collections/users/schemas/user.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { SelfHostedSeedService } from '@api/seeds/self-hosted-seed.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    LoggerModule,
    MongooseModule.forFeature(
      [
        { name: User.name, schema: UserSchema },
        { name: Organization.name, schema: OrganizationSchema },
        { name: OrganizationSetting.name, schema: OrganizationSettingSchema },
      ],
      DB_CONNECTIONS.AUTH,
    ),
    MongooseModule.forFeature(
      [{ name: Brand.name, schema: BrandSchema }],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [SelfHostedSeedService],
})
export class SelfHostedSeedModule {}
