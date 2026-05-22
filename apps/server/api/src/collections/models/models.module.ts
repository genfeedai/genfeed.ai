/**
 * Models Module
 * AI model configurations: model selections, parameters, version management,
 * and model performance tracking.
 */
import { ModelsController } from '@api/collections/models/controllers/models.controller';
import { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [ModelsController],
  exports: [ModelsService, ModelRegistrationService],
  imports: [forwardRef(() => OrganizationSettingsModule)],
  providers: [ModelsService, ModelRegistrationService],
})
export class ModelsModule {}
