import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { SkillCatalogSeedService } from '@api/seeds/skill-catalog-seed.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';
import { AdminSkillSyncController } from './skill-sync.controller';
import { AdminSkillSyncService } from './skill-sync.service';

@Module({
  controllers: [AdminSkillSyncController],
  imports: [LoggerModule, PrismaModule],
  providers: [
    AdminSkillSyncService,
    IpWhitelistGuard,
    SkillCatalogSeedService,
    SuperAdminGuard,
  ],
})
export class AdminSkillSyncModule {}
