import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { AdminOrganizationMembersController } from '@api/endpoints/admin/organization-members/organization-members.controller';
import { AdminOrganizationMembersService } from '@api/endpoints/admin/organization-members/organization-members.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AdminOrganizationMembersController],
  providers: [
    AdminOrganizationMembersService,
    IpWhitelistGuard,
    SuperAdminGuard,
  ],
})
export class AdminOrganizationMembersModule {}
