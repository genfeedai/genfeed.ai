/**
 * Users Module
 * User brand management: user profiles, authentication integration,
 * user preferences, and activity tracking.
 */
import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { MembersModule } from '@api/collections/members/members.module';
import { OrganizationsCoreModule } from '@api/collections/organizations/organizations-core.module';
import { SettingsModule } from '@api/collections/settings/settings.module';
import { SubscriptionsModule } from '@api/collections/subscriptions/subscriptions.module';
import { UsersController } from '@api/collections/users/controllers/users.controller';
import { UsersRelationshipsController } from '@api/collections/users/controllers/users-relationships.controller';
import { UsersCoreModule } from '@api/collections/users/users-core.module';
import { CommonModule } from '@api/common/common.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [UsersRelationshipsController, UsersController],
  exports: [UsersCoreModule],
  imports: [
    UsersCoreModule,
    BrandsCoreModule,
    CommonModule,
    FilesClientModule,
    MembersModule,
    OrganizationsCoreModule,
    SettingsModule,
    SubscriptionsModule,
  ],
})
export class UsersModule {}
