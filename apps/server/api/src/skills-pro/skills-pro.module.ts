import { SkillsCoreModule } from '@api/collections/skills/skills-core.module';
import { billingControllers } from '@api/common/subscriptions/billing.providers';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { StripeModule } from '@api/services/integrations/stripe/stripe.module';
import { SkillCheckoutController } from '@api/skills-pro/controllers/skill-checkout.controller';
import { SkillDownloadController } from '@api/skills-pro/controllers/skill-download.controller';
import { SkillRegistryController } from '@api/skills-pro/controllers/skill-registry.controller';
import { SkillCheckoutService } from '@api/skills-pro/services/skill-checkout.service';
import { SkillDownloadService } from '@api/skills-pro/services/skill-download.service';
import { SkillRegistryService } from '@api/skills-pro/services/skill-registry.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [
    SkillRegistryController,
    ...billingControllers([SkillCheckoutController, SkillDownloadController]),
  ],
  exports: [SkillCheckoutService, SkillDownloadService, SkillRegistryService],
  imports: [FilesClientModule, SkillsCoreModule, StripeModule],
  providers: [SkillCheckoutService, SkillDownloadService, SkillRegistryService],
})
export class SkillsProModule {}
