import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { StripeModule } from '@api/services/integrations/stripe/stripe.module';
import { SkillCheckoutController } from '@api/skills-pro/controllers/skill-checkout.controller';
import { SkillDownloadController } from '@api/skills-pro/controllers/skill-download.controller';
import { SkillRegistryController } from '@api/skills-pro/controllers/skill-registry.controller';
import { SkillCheckoutService } from '@api/skills-pro/services/skill-checkout.service';
import { SkillDownloadService } from '@api/skills-pro/services/skill-download.service';
import { SkillRegistryService } from '@api/skills-pro/services/skill-registry.service';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [
    SkillCheckoutController,
    SkillDownloadController,
    SkillRegistryController,
  ],
  exports: [SkillCheckoutService, SkillDownloadService, SkillRegistryService],
  imports: [
    forwardRef(() => FilesClientModule),
    forwardRef(() => StripeModule),
  ],
  providers: [SkillCheckoutService, SkillDownloadService, SkillRegistryService],
})
export class SkillsProModule {}
