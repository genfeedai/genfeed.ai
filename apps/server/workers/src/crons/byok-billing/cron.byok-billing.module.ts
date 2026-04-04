import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { ByokBillingModule } from '@api/services/byok-billing/byok-billing.module';
import { forwardRef, Module } from '@nestjs/common';
import { CronByokBillingService } from '@workers/crons/byok-billing/cron.byok-billing.service';

@Module({
  imports: [
    forwardRef(() => ByokBillingModule),
    forwardRef(() => OrganizationSettingsModule),
  ],
  providers: [CronByokBillingService],
})
export class CronByokBillingModule {}
