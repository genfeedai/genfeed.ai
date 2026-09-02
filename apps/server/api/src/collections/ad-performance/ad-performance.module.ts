import { AdPerformanceService } from '@api/collections/ad-performance/services/ad-performance.service';
import { SERVER_TOKENS } from '@api/server.dependencies';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [AdPerformanceService],
  imports: [],
  providers: [
    AdPerformanceService,
    { provide: SERVER_TOKENS.prisma, useExisting: PrismaService },
  ],
})
export class AdPerformanceModule {}
