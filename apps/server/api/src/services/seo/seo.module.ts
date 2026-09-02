import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { SeoScorerService } from '@api/services/seo/seo-scorer.service';
import { createServiceModule } from '@api/shared/service-module.factory';

/**
 * Canonical SEO scorer module (#758). PrismaService is provided globally;
 * OpenRouterModule supplies the LLM client for the qualitative layer.
 */
export const SeoModule = createServiceModule(SeoScorerService, {
  additionalImports: [OpenRouterModule],
});
