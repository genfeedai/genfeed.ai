/**
 * Template Metadata Module
 * Stores template properties and aggregated usage statistics
 * Service-only (no controller) - follows ingredient.metadata pattern
 */
import { TemplateMetadataService } from '@api/collections/template-metadata/services/template-metadata.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [],
  exports: [TemplateMetadataService],
  imports: [],
  providers: [TemplateMetadataService],
})
export class TemplateMetadataModule {}
