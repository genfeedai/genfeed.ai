import {
  AdOptimizationAuditLog,
  AdOptimizationAuditLogSchema,
} from '@api/collections/ad-optimization-audit-logs/schemas/ad-optimization-audit-log.schema';
import { AdOptimizationAuditLogsService } from '@api/collections/ad-optimization-audit-logs/services/ad-optimization-audit-logs.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  exports: [AdOptimizationAuditLogsService, MongooseModule],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          name: AdOptimizationAuditLog.name,
          useFactory: () => {
            const schema = AdOptimizationAuditLogSchema;

            schema.index(
              { isDeleted: 1, organization: 1, runDate: -1 },
              {
                name: 'org_audit_logs',
                partialFilterExpression: { isDeleted: false },
              },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [AdOptimizationAuditLogsService],
})
export class AdOptimizationAuditLogsModule {}
