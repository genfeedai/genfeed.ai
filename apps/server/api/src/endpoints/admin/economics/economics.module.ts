import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { EconomicsController } from '@api/endpoints/admin/economics/economics.controller';
import { EconomicsService } from '@api/endpoints/admin/economics/economics.service';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [EconomicsController],
  imports: [PrismaModule],
  providers: [EconomicsService, IpWhitelistGuard, SuperAdminGuard],
})
export class AdminEconomicsModule {}
