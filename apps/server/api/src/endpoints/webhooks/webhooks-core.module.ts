import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { ApiKeysModule } from '@api/collections/api-keys/api-keys.module';
import { AssetsModule } from '@api/collections/assets/assets.module';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { ClipProjectsModule } from '@api/collections/clip-projects/clip-projects.module';
import { ClipResultsModule } from '@api/collections/clip-results/clip-results.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { EvaluationsModule } from '@api/collections/evaluations/evaluations.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MembersModule } from '@api/collections/members/members.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { RolesModule } from '@api/collections/roles/roles.module';
import { SettingsModule } from '@api/collections/settings/settings.module';
import { SubscriptionAttributionsModule } from '@api/collections/subscription-attributions/subscription-attributions.module';
import { SubscriptionsModule } from '@api/collections/subscriptions/subscriptions.module';
import { TrainingsModule } from '@api/collections/trainings/trainings.module';
import { UserSubscriptionsModule } from '@api/collections/user-subscriptions/user-subscriptions.module';
import { UserSetupModule } from '@api/collections/users/user-setup.module';
import { UsersModule } from '@api/collections/users/users.module';
import { VoicesModule } from '@api/collections/voices/voices.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { CommonModule } from '@api/common/common.module';
import { ArgilWebhookService } from '@api/endpoints/webhooks/argil/webhooks.argil.service';
import { ChromaticWebhookService } from '@api/endpoints/webhooks/chromatic/webhooks.chromatic.service';
import { FleetWebhookService } from '@api/endpoints/webhooks/fleet/webhooks.fleet.service';
import { GitHubWebhookService } from '@api/endpoints/webhooks/github/webhooks.github.service';
import { HeygenWebhookService } from '@api/endpoints/webhooks/heygen/webhooks.heygen.service';
import { HeygenWebhookVerificationService } from '@api/endpoints/webhooks/heygen/webhooks.heygen.verification.service';
import { KlingWebhookService } from '@api/endpoints/webhooks/klingai/webhooks.kling.service';
import { LeonardoaiWebhookService } from '@api/endpoints/webhooks/leonardoai/webhooks.leonardoai.service';
import { OpusProWebhookService } from '@api/endpoints/webhooks/opuspro/webhooks.opuspro.service';
import { ReplicateGenerationWebhookHandler } from '@api/endpoints/webhooks/replicate/handlers/replicate-generation-webhook.handler';
import { ReplicateWebhookService } from '@api/endpoints/webhooks/replicate/webhooks.replicate.service';
import { ReplicateWebhookVerificationService } from '@api/endpoints/webhooks/replicate/webhooks.replicate.verification.service';
import { ActivityUpdateService } from '@api/endpoints/webhooks/services/activity-update.service';
import { AutoMergeService } from '@api/endpoints/webhooks/services/auto-merge.service';
import { MediaUploadService } from '@api/endpoints/webhooks/services/media-upload.service';
import { MetadataLookupService } from '@api/endpoints/webhooks/services/metadata-lookup.service';
import { PostProcessingOrchestratorService } from '@api/endpoints/webhooks/services/post-processing-orchestrator.service';
import { StripeWebhooksModule } from '@api/endpoints/webhooks/stripe/stripe-webhooks.module';
import { VercelWebhookService } from '@api/endpoints/webhooks/vercel/webhooks.vercel.service';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { TransactionModule } from '@api/helpers/utils/transaction/transaction.module';
import { BotGatewayModule } from '@api/services/bot-gateway/bot-gateway.module';
import { CacheService } from '@api/services/cache/cache.service';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { FileQueueModule } from '@api/services/files-microservice/queue/file-queue.module';
import { ArgilModule } from '@api/services/integrations/argil/argil.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { StripeModule } from '@api/services/integrations/stripe/stripe.module';
import { MediaVendorCostModule } from '@api/services/media-vendor-cost/media-vendor-cost.module';
import { MicroservicesModule } from '@api/services/microservices/microservices.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Module } from '@nestjs/common';

/**
 * Webhook providers without HTTP controllers. Workers import this so they
 * can complete media jobs without mounting the inbound webhook surface.
 */
@Module({
  exports: [
    ArgilWebhookService,
    ChromaticWebhookService,
    FleetWebhookService,
    GitHubWebhookService,
    HeygenWebhookService,
    KlingWebhookService,
    LeonardoaiWebhookService,
    OpusProWebhookService,
    ReplicateWebhookService,
    VercelWebhookService,
    WebhooksService,
  ],
  imports: [
    ArgilModule,
    ActivitiesModule,
    ApiKeysModule,
    AssetsModule,
    BotGatewayModule,
    BrandsModule,
    ClipProjectsModule,
    ClipResultsModule,
    CommonModule,
    CreditsModule,
    EvaluationsModule,
    FileQueueModule,
    FilesClientModule,
    IngredientsModule,
    MediaVendorCostModule,
    MembersModule,
    MetadataModule,
    MicroservicesModule,
    ModelsModule,
    NotificationsModule,
    NotificationsPublisherModule,
    OrganizationSettingsModule,
    OrganizationsModule,
    ReplicateModule,
    RolesModule,
    SettingsModule,
    StripeModule,
    StripeWebhooksModule,
    SubscriptionAttributionsModule,
    SubscriptionsModule,
    TrainingsModule,
    TransactionModule,
    UserSubscriptionsModule,
    UserSetupModule,
    UsersModule,
    VoicesModule,
    WorkflowsModule,
  ],
  providers: [
    ArgilWebhookService,
    ActivityUpdateService,
    AutoMergeService,
    ChromaticWebhookService,
    FleetWebhookService,
    ModelRegistrationService,
    GitHubWebhookService,
    HeygenWebhookService,
    HeygenWebhookVerificationService,
    KlingWebhookService,
    LeonardoaiWebhookService,
    MediaUploadService,
    MetadataLookupService,
    OpusProWebhookService,
    PostProcessingOrchestratorService,
    ReplicateGenerationWebhookHandler,
    ReplicateWebhookService,
    // Framework-agnostic construction: factory injects deps without relying on
    // decorator metadata for this verification service (#2738).
    {
      inject: [CacheService, ConfigService, LoggerService, ReplicateService],
      provide: ReplicateWebhookVerificationService,
      useFactory: (
        cacheService: CacheService,
        configService: ConfigService,
        loggerService: LoggerService,
        replicateService: ReplicateService,
      ) =>
        new ReplicateWebhookVerificationService(
          cacheService,
          configService,
          loggerService,
          replicateService,
        ),
    },
    VercelWebhookService,
    WebhooksService,
  ],
})
export class WebhooksCoreModule {}
