import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { UnitEconomicsController } from '@api/endpoints/admin/unit-economics/unit-economics.controller';
import { UnitEconomicsService } from '@api/endpoints/admin/unit-economics/unit-economics.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [UnitEconomicsController],
  imports: [PrismaModule],
  providers: [IpWhitelistGuard, SuperAdminGuard, UnitEconomicsService],
})
export class AdminUnitEconomicsModule {}
