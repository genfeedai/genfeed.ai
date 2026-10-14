import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { EmailProductSignalsModule } from '@api/services/email-product-signals/email-product-signals.module';
import { LowCreditThresholdModule } from '@api/services/low-credit-threshold/low-credit-threshold.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';
import { FreeTrialEmailsService } from './free-trial-emails.service';
import { LifecycleEmailService } from './lifecycle-email.service';
import { LifecycleEmailMaintenanceService } from './lifecycle-email-maintenance.service';
import { LifecycleEmailWorkService } from './lifecycle-email-work.service';
import { LifecycleEmailWorkflowService } from './lifecycle-email-workflow.service';
import { LifecycleEmailsController } from './lifecycle-emails.controller';

@Module({
  controllers: [LifecycleEmailsController],
  exports: [FreeTrialEmailsService, LifecycleEmailService],
  imports: [
    ConfigModule,
    // The organization workflow runs the product-signal steps as nodes, and
    // every process that registers it must also register their executors.
    EmailProductSignalsModule,
    LoggerModule,
    LowCreditThresholdModule,
    NotificationsModule,
    WorkflowsCoreModule,
  ],
  providers: [
    FreeTrialEmailsService,
    LifecycleEmailWorkflowService,
    LifecycleEmailService,
    LifecycleEmailMaintenanceService,
    LifecycleEmailWorkService,
  ],
})
export class LifecycleEmailsModule {}
