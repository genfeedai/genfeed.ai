/**
 * Template Usage Module
 * Tracks individual template usage records with generated content and feedback
 * Service-only (no controller) - follows template-metadata pattern
 */
import { TemplateUsageService } from '@api/collections/template-usage/services/template-usage.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [],
  exports: [TemplateUsageService],
  imports: [],
  providers: [TemplateUsageService],
})
export class TemplateUsageModule {}
