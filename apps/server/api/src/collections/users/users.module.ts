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
import { UsersNotificationInboxController } from '@api/collections/users/controllers/users-notification-inbox.controller';
import { UsersRelationshipsController } from '@api/collections/users/controllers/users-relationships.controller';
import { UsersCoreModule } from '@api/collections/users/users-core.module';
import { CommonModule } from '@api/common/common.module';
import { ServerFunnelCaptureModule } from '@api/services/analytics/server-funnel-capture.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [
    UsersNotificationInboxController,
    UsersRelationshipsController,
    UsersController,
  ],
  exports: [UsersCoreModule],
  imports: [
    UsersCoreModule,
    BrandsCoreModule,
    CommonModule,
    // Leaf-level, zero-import module (see ServerFunnelCaptureModule) — safe to
    // import here, unlike CreditsModule (see UsersController's constructor
    // comment and user-setup.module.ts).
    ServerFunnelCaptureModule,
    FilesClientModule,
    MembersModule,
    NotificationsModule,
    OrganizationsCoreModule,
    SettingsModule,
    SubscriptionsModule,
  ],
})
export class UsersModule {}
