import { ModelsModule } from '@api/collections/models/models.module';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { AdminModelDetailController } from '@api/endpoints/admin/model-pricing/model-detail.controller';
import { AdminModelPricingController } from '@api/endpoints/admin/model-pricing/model-pricing.controller';
import { AdminModelPricingService } from '@api/endpoints/admin/model-pricing/model-pricing.service';
import { ProviderPriceSyncService } from '@api/endpoints/admin/model-pricing/provider-price-sync.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { PLATFORM_SCHEDULE_QUEUE } from '@genfeedai/contracts/queue';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AdminModelPricingController, AdminModelDetailController],
  imports: [
    PrismaModule,
    ModelsModule,
    BullModule.registerQueue({ name: PLATFORM_SCHEDULE_QUEUE }),
  ],
  providers: [
    IpWhitelistGuard,
    SuperAdminGuard,
    AdminModelPricingService,
    ProviderPriceSyncService,
  ],
})
export class AdminModelPricingModule {}
