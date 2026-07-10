import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Module } from '@nestjs/common';
import { AdPerformanceService } from '@server/collections/ad-performance/services/ad-performance.service';
import { SERVER_TOKENS } from '@server/server.dependencies';

@Module({
  exports: [AdPerformanceService],
  imports: [],
  providers: [
    AdPerformanceService,
    { provide: SERVER_TOKENS.prisma, useExisting: PrismaService },
  ],
})
export class AdPerformanceModule {}
