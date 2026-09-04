import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { WebhooksCoreModule } from '@api/endpoints/webhooks/webhooks-core.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [IngredientsModule, ReplicateModule, WebhooksCoreModule],
  imports: [
    LoggerModule,
    IngredientsModule,
    ReplicateModule,
    WebhooksCoreModule,
  ],
})
export class ReplicatePollModule {}
