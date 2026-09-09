import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { EmailProductSignalsModule } from '@api/services/email-product-signals/email-product-signals.module';
import { LifecycleEmailsModule } from '@api/services/lifecycle-emails/lifecycle-emails.module';
import { Module } from '@nestjs/common';
import { CronLifecycleEmailsService } from './cron.lifecycle-emails.service';

@Module({
  imports: [WorkflowsModule, LifecycleEmailsModule, EmailProductSignalsModule],
  providers: [CronLifecycleEmailsService],
  exports: [CronLifecycleEmailsService],
})
export class CronLifecycleEmailsModule {}
