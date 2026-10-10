import { AdminApiKeyGuard } from '@api/helpers/guards/admin-api-key/admin-api-key.guard';
import { AgentReportDeliveryModule } from '@api/services/agent-reports/agent-report-delivery.module';
import { AgentReportReviewController } from '@api/services/agent-reports/agent-report-review.controller';
import { AgentReportReviewService } from '@api/services/agent-reports/agent-report-review.service';
import { CacheModule } from '@api/services/cache/cache.module';
import { TurboRunModule } from '@api/services/turbo-run/turbo-run.module';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';
@Module({
  imports: [
    AgentReportDeliveryModule,
    TurboRunModule,
    CacheModule,
    PrismaModule,
  ],
  controllers: [AgentReportReviewController],
  providers: [AdminApiKeyGuard, AgentReportReviewService],
})
export class AgentReportReviewModule {}
