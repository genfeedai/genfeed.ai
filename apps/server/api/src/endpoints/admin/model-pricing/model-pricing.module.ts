import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { AdminModelPricingController } from '@api/endpoints/admin/model-pricing/model-pricing.controller';
import { AdminModelPricingService } from '@api/endpoints/admin/model-pricing/model-pricing.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AdminModelPricingController],
  imports: [PrismaModule],
  providers: [IpWhitelistGuard, SuperAdminGuard, AdminModelPricingService],
})
export class AdminModelPricingModule {}
