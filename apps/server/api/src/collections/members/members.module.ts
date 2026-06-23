/**
 * Members Module
 * Organization membership: member invitations, role assignments,
and team collaboration features.
 */

import { InvitationsController } from '@api/collections/members/controllers/invitations.controller';
import { MembersController } from '@api/collections/members/controllers/members.controller';
import { InvitationService } from '@api/collections/members/services/invitation.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { RolesModule } from '@api/collections/roles/roles.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [InvitationsController, MembersController],
  exports: [InvitationService, MembersService],
  imports: [
    forwardRef(() => NotificationsModule),
    forwardRef(() => RolesModule),
  ],
  providers: [InvitationService, MembersService],
})
export class MembersModule {}
