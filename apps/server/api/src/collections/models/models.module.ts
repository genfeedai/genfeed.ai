/**
 * Models Module
 * AI model configurations: model selections, parameters, version management,
 * and model performance tracking.
 */
import { ModelsController } from '@api/collections/models/controllers/models.controller';
import { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { CrunCoreModule } from '@api/services/integrations/crun/crun-core.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [ModelsController],
  exports: [ModelsService, ModelRegistrationService, ModelCreditQuoteService],
  imports: [OrganizationSettingsModule, CrunCoreModule],
  providers: [ModelsService, ModelRegistrationService, ModelCreditQuoteService],
})
export class ModelsModule {}
