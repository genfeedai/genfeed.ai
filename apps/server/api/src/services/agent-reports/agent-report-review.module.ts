import { AdminApiKeyGuard } from '@api/helpers/guards/admin-api-key/admin-api-key.guard';
import { AgentReportDeliveryModule } from '@api/services/agent-reports/agent-report-delivery.module';
import { AgentReportReviewController } from '@api/services/agent-reports/agent-report-review.controller';
import { AgentReportReviewService } from '@api/services/agent-reports/agent-report-review.service';
import { BatchGenerationModule } from '@api/services/batch-generation/batch-generation.module';
import { CacheModule } from '@api/services/cache/cache.module';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';
@Module({
  imports: [
    AgentReportDeliveryModule,
    BatchGenerationModule,
    CacheModule,
    PrismaModule,
  ],
  controllers: [AgentReportReviewController],
  providers: [AdminApiKeyGuard, AgentReportReviewService],
})
export class AgentReportReviewModule {}
