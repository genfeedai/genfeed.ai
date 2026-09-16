import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { AssetsModule } from '@api/collections/assets/assets.module';
import { EvaluationsModule } from '@api/collections/evaluations/evaluations.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { ActivityUpdateService } from '@api/endpoints/webhooks/services/activity-update.service';
import { AutoMergeService } from '@api/endpoints/webhooks/services/auto-merge.service';
import { MediaUploadService } from '@api/endpoints/webhooks/services/media-upload.service';
import { MetadataLookupService } from '@api/endpoints/webhooks/services/metadata-lookup.service';
import { PostProcessingOrchestratorService } from '@api/endpoints/webhooks/services/post-processing-orchestrator.service';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { BotCallbackModule } from '@api/services/bot-gateway/bot-callback.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { FileQueueModule } from '@api/services/files-microservice/queue/file-queue.module';
import { MediaVendorCostModule } from '@api/services/media-vendor-cost/media-vendor-cost.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { Module } from '@nestjs/common';

/**
 * Leaf module for the webhook media-processing path: finalising an ingredient
 * from a provider result (`WebhooksService.processMediaForIngredient` and the
 * webhook/failure entry points next to it) plus the collaborators that path
 * needs — persistence, storage, activity, cost and notification primitives.
 *
 * Generation modules (musics today; images/videos when they need it) import
 * this directly instead of reaching `WebhooksService` through `ModuleRef`, so
 * a missing provider fails at boot. It must never import Brands, Workflows,
 * Content Engine, or anything else that reaches back into a generation
 * module — `module-graph.spec.ts` lists it as a leaf. `WebhooksCoreModule`
 * re-exports it for callers that still resolve the service from the hub.
 */
@Module({
  exports: [WebhooksService],
  imports: [
    ActivitiesModule,
    AssetsModule,
    BotCallbackModule,
    EvaluationsModule,
    FileQueueModule,
    FilesClientModule,
    IngredientsModule,
    MediaVendorCostModule,
    MetadataModule,
    NotificationsModule,
    NotificationsPublisherModule,
    OrganizationSettingsModule,
  ],
  providers: [
    ActivityUpdateService,
    AutoMergeService,
    MediaUploadService,
    MetadataLookupService,
    PostProcessingOrchestratorService,
    WebhooksService,
  ],
})
export class WebhooksMediaModule {}
