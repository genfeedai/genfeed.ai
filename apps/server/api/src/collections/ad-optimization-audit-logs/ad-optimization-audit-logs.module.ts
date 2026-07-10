import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Module } from '@nestjs/common';
import { AdOptimizationAuditLogsService } from '@server/collections/ad-optimization-audit-logs/services/ad-optimization-audit-logs.service';
import { SERVER_TOKENS } from '@server/server.dependencies';

@Module({
  exports: [AdOptimizationAuditLogsService],
  imports: [],
  providers: [
    AdOptimizationAuditLogsService,
    { provide: SERVER_TOKENS.logger, useExisting: LoggerService },
    { provide: SERVER_TOKENS.prisma, useExisting: PrismaService },
  ],
})
export class AdOptimizationAuditLogsModule {}
