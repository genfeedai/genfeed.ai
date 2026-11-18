import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { AdminCommunityController } from '@api/endpoints/admin/community/community.controller';
import { AdminCommunityService } from '@api/endpoints/admin/community/community.service';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AdminCommunityController],
  providers: [AdminCommunityService, IpWhitelistGuard, SuperAdminGuard],
})
export class AdminCommunityModule {}
