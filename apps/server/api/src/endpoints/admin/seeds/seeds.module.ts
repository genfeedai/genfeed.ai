import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { PlatformTemplateSeedService } from '@api/seeds/platform-template-seed.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';
import { AdminSeedsController } from './seeds.controller';
import { AdminSeedsService } from './seeds.service';

@Module({
  controllers: [AdminSeedsController],
  imports: [LoggerModule, PrismaModule],
  providers: [
    IpWhitelistGuard,
    PlatformTemplateSeedService,
    SuperAdminGuard,
    AdminSeedsService,
  ],
})
export class AdminSeedsModule {}
