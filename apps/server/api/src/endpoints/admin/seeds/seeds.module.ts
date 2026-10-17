import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';
import { AdminSeedsController } from './seeds.controller';
import { AdminSeedsService } from './seeds.service';

@Module({
  controllers: [AdminSeedsController],
  imports: [PrismaModule],
  providers: [IpWhitelistGuard, SuperAdminGuard, AdminSeedsService],
})
export class AdminSeedsModule {}
