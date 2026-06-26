import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { createServiceModule } from '@api/shared/service-module.factory';
import { forwardRef } from '@nestjs/common';

import { SeoScorerService } from './seo-scorer.service';

/**
 * Canonical SEO scorer module (#758). PrismaService is provided globally;
 * OpenRouterModule supplies the LLM client for the qualitative layer.
 */
export const SeoModule = createServiceModule(SeoScorerService, {
  additionalImports: [forwardRef(() => OpenRouterModule)],
});
