/**
 * HeyGen Poll Module
 *
 * Wires dependencies for the HeygenPollProcessor (which lives in this
 * directory but is registered as a provider by the workers app's
 * ProcessorsModule). Re-exports the transitive modules the processor
 * needs so that ProcessorsModule only has to import HeygenPollModule.
 *
 * Queue registration lives in:
 *   - apps/server/api/src/queues/core/queues.module.ts (API producer)
 *   - apps/server/workers/src/queues/queues.module.ts (workers consumer)
 */
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { TasksModule } from '@api/collections/tasks/tasks.module';
import { WebhooksModule } from '@api/endpoints/webhooks/webhooks.module';
import { AvatarVideoModule } from '@api/services/avatar-video/avatar-video.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [
    AvatarVideoModule,
    WebhooksModule,
    TasksModule,
    MetadataModule,
    IngredientsModule,
  ],
  imports: [
    LoggerModule,
    forwardRef(() => AvatarVideoModule),
    forwardRef(() => WebhooksModule),
    forwardRef(() => TasksModule),
    forwardRef(() => MetadataModule),
    forwardRef(() => IngredientsModule),
  ],
})
export class HeygenPollModule {}
