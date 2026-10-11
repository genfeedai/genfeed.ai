import { BrandAccessModule } from '@api/authorization/brand-access/brand-access.module';
/**
 * Members Module
 * Organization membership: member invitations, role assignments,
and team collaboration features.
 */

import { InvitationsController } from '@api/collections/members/controllers/invitations.controller';
import { MemberAppsController } from '@api/collections/members/controllers/member-apps.controller';
import { MembersController } from '@api/collections/members/controllers/members.controller';
import { TeamMentionsController } from '@api/collections/members/controllers/team-mentions.controller';
import { InvitationService } from '@api/collections/members/services/invitation.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { RolesModule } from '@api/collections/roles/roles.module';
import { CommonModule } from '@api/common/common.module';
import { OrganizationModuleAccessModule } from '@api/common/organization-modules/organization-module-access.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [
    InvitationsController,
    MemberAppsController,
    MembersController,
    TeamMentionsController,
  ],
  exports: [InvitationService, MembersService],
  imports: [
    BrandAccessModule,
    CommonModule,
    NotificationsModule,
    OrganizationModuleAccessModule,
    RolesModule,
  ],
  providers: [InvitationService, MembersService],
})
export class MembersModule {}
