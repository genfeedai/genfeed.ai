/**
 * Members Module
 * Organization membership: member invitations, role assignments,
and team collaboration features.
 */

import { MembersController } from '@api/collections/members/controllers/members.controller';
import { MembersService } from '@api/collections/members/services/members.service';
import { RolesModule } from '@api/collections/roles/roles.module';
import { ClerkModule } from '@api/services/integrations/clerk/clerk.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [MembersController],
  exports: [MembersService],
  imports: [ClerkModule, RolesModule],
  providers: [MembersService],
})
export class MembersModule {}
