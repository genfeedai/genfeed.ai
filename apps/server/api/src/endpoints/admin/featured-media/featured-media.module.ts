import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { AdminFeaturedMediaController } from '@api/endpoints/admin/featured-media/featured-media.controller';
import { AdminFeaturedMediaService } from '@api/endpoints/admin/featured-media/featured-media.service';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AdminFeaturedMediaController],
  providers: [AdminFeaturedMediaService, IpWhitelistGuard, SuperAdminGuard],
})
export class AdminFeaturedMediaModule {}
