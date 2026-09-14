import { MembersModule } from '@api/collections/members/members.module';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  BrandOsExportController,
  PublicBrandOsExportController,
} from '@api/services/brand-os-export/brand-os-export.controller';
import { BrandOsExportService } from '@api/services/brand-os-export/brand-os-export.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';
@Module({
  imports: [ConfigModule, LoggerModule, MembersModule, PrismaModule],
  controllers: [BrandOsExportController, PublicBrandOsExportController],
  exports: [BrandOsExportService],
  providers: [BrandOsExportService, RolesGuard],
})
export class BrandOsExportModule {}
