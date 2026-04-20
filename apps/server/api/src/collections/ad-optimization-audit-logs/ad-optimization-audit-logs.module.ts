import { AdOptimizationAuditLogsService } from '@api/collections/ad-optimization-audit-logs/services/ad-optimization-audit-logs.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [AdOptimizationAuditLogsService],
  imports: [],
  providers: [AdOptimizationAuditLogsService],
})
export class AdOptimizationAuditLogsModule {}
