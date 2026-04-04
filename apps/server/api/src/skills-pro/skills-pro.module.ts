import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { StripeModule } from '@api/services/integrations/stripe/stripe.module';
import { SkillCheckoutController } from '@api/skills-pro/controllers/skill-checkout.controller';
import { SkillDownloadController } from '@api/skills-pro/controllers/skill-download.controller';
import { SkillRegistryController } from '@api/skills-pro/controllers/skill-registry.controller';
import {
  SkillReceipt,
  SkillReceiptSchema,
} from '@api/skills-pro/schemas/skill-receipt.schema';
import { SkillCheckoutService } from '@api/skills-pro/services/skill-checkout.service';
import { SkillDownloadService } from '@api/skills-pro/services/skill-download.service';
import { SkillRegistryService } from '@api/skills-pro/services/skill-registry.service';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [
    SkillCheckoutController,
    SkillDownloadController,
    SkillRegistryController,
  ],
  exports: [SkillCheckoutService, SkillDownloadService, SkillRegistryService],
  imports: [
    FilesClientModule,
    StripeModule,
    MongooseModule.forFeature(
      [{ name: SkillReceipt.name, schema: SkillReceiptSchema }],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [SkillCheckoutService, SkillDownloadService, SkillRegistryService],
})
export class SkillsProModule {}
