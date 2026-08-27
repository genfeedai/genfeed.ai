import { DefaultRecurringContentService } from '@server/collections/brands/services/default-recurring-content.service';
import { WorkflowTemplateSeederService } from '@server/collections/workflows/services/workflow-template-seeder.service';
import { WorkflowsService } from '@server/collections/workflows/services/workflows.service';
import { WorkflowDeploymentBackfillService } from '@api/seeds/workflow-deployment-backfill.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [ConfigModule, LoggerModule, PrismaModule],
  providers: [
    WorkflowsService,
    DefaultRecurringContentService,
    WorkflowDeploymentBackfillService,
    // Seeding moved out of WorkflowsService in #754; the backfill service
    // resolves this via ModuleRef per-org. Its only required deps (Prisma,
    // Logger) come from the imported modules; WorkflowExecutionQueueService is
    // @Optional and guarded in the seeder, so it's safe to omit here.
    WorkflowTemplateSeederService,
  ],
})
export class WorkflowBackfillModule {}
