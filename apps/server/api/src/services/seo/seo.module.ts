import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { SeoScorerService } from '@api/services/seo/seo-scorer.service';
import { createServiceModule } from '@api/shared/service-module.factory';

/**
 * Canonical SEO scorer module (#758). PrismaService is provided globally;
 * LlmDispatcherModule supplies the schema-enforced LLM call for the
 * qualitative layer.
 */
export const SeoModule = createServiceModule(SeoScorerService, {
  additionalImports: [LlmDispatcherModule],
});
