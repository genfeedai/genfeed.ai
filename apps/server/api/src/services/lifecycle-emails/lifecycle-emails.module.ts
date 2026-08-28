import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';
import { LifecycleEmailService } from './lifecycle-email.service';
import { LifecycleEmailWorkflowService } from './lifecycle-email-workflow.service';
import { LifecycleEmailsController } from './lifecycle-emails.controller';

@Module({
  controllers: [LifecycleEmailsController],
  exports: [LifecycleEmailService],
  imports: [ConfigModule, LoggerModule, NotificationsModule, WorkflowsModule],
  providers: [LifecycleEmailWorkflowService, LifecycleEmailService],
})
export class LifecycleEmailsModule {}
