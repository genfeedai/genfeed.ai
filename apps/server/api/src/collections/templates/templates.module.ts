/**
 * Templates Module
 * Prompt templates with {{variables}}: content patterns like "Introducing {{product_name}}!".
 * Users fill variables → generate content. Supports AI suggestions and usage tracking.
 * NOTE: Different from Presets (which are saved PromptBar configurations).
 */

import { CreditsModule } from '@api/collections/credits/credits.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { TemplateMetadataModule } from '@api/collections/template-metadata/template-metadata.module';
import { TemplateUsageModule } from '@api/collections/template-usage/template-usage.module';
import { TemplatesController } from '@api/collections/templates/controllers/templates.controller';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { ConfigModule } from '@api/config/config.module';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [TemplatesController],
  exports: [TemplatesService],
  imports: [
    ByokModule,
    ConfigModule,
    forwardRef(() => CreditsModule),
    forwardRef(() => ModelsModule),
    forwardRef(() => ReplicateModule),
    TemplateMetadataModule,
    forwardRef(() => TemplateUsageModule),
  ],
  providers: [TemplatesService, CreditsGuard, CreditsInterceptor],
})
export class TemplatesModule {}
