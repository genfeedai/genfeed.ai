import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { WebhooksCoreModule } from '@api/endpoints/webhooks/webhooks-core.module';
import { HiggsFieldModule } from '@api/services/integrations/higgsfield/higgsfield.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

/**
 * Wires the worker-owned HiggsFieldPollProcessor. Queue registration lives in
 * the API (`queues/core/queues.module.ts`) and workers
 * (`workers/src/queues/queues.module.ts`) queue modules.
 */
@Module({
  exports: [HiggsFieldModule, IngredientsModule, WebhooksCoreModule],
  imports: [
    HiggsFieldModule,
    IngredientsModule,
    LoggerModule,
    WebhooksCoreModule,
  ],
})
export class HiggsFieldPollModule {}
