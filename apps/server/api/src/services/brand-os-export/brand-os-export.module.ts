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
  imports: [ConfigModule, LoggerModule, PrismaModule],
  controllers: [BrandOsExportController, PublicBrandOsExportController],
  exports: [BrandOsExportService],
  providers: [BrandOsExportService],
})
export class BrandOsExportModule {}
