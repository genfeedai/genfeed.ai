import baseConfig from '@api-root/vitest.config';
import { defineConfig, mergeConfig } from 'vitest/config';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: [
        'src/endpoints/ai-actions/ai-actions.controller.spec.ts',
        'src/endpoints/docs/docs.controller.spec.ts',
        'src/endpoints/webhooks/opuspro/webhooks.opuspro.controller.spec.ts',
        'src/endpoints/admin/darkroom/darkroom.controller.spec.ts',
        'src/endpoints/onboarding/onboarding.controller.spec.ts',
        'src/endpoints/integrations/shopify/shopify.controller.spec.ts',
      ],
    },
  }),
);
