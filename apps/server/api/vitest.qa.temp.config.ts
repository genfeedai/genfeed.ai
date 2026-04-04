import baseConfig from '@api-root/vitest.config';
import { defineConfig, mergeConfig } from 'vitest/config';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: [
        'src/endpoints/webhooks/stripe/webhooks.stripe.controller.spec.ts',
        'src/endpoints/webhooks/stripe/webhooks.stripe.service.spec.ts',
        'src/collections/trends/controllers/trends.controller.spec.ts',
        'src/collections/trends/services/trends.service.spec.ts',
      ],
    },
  }),
);
