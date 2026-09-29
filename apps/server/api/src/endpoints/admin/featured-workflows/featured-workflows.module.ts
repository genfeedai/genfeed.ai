import { FeaturedWorkflowsModule } from '@api/collections/workflows/featured-workflows.module';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { FeaturedWorkflowsController } from '@api/endpoints/admin/featured-workflows/featured-workflows.controller';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { Module } from '@nestjs/common';

@Module({
  controllers: [FeaturedWorkflowsController],
  imports: [FeaturedWorkflowsModule],
  providers: [IpWhitelistGuard, SuperAdminGuard],
})
export class AdminFeaturedWorkflowsModule {}
