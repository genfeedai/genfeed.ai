import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { PublishPipelineController } from '@api/endpoints/admin/publish-pipeline/publish-pipeline.controller';
import { PublishPipelineService } from '@api/endpoints/admin/publish-pipeline/publish-pipeline.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [PublishPipelineController],
  imports: [PrismaModule],
  providers: [IpWhitelistGuard, PublishPipelineService, SuperAdminGuard],
})
export class AdminPublishPipelineModule {}
