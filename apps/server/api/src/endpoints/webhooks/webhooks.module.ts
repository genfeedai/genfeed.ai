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
import { CommonModule } from '@api/common/common.module';
import { ChromaticWebhookController } from '@api/endpoints/webhooks/chromatic/webhooks.chromatic.controller';
import { ChromaticWebhookService } from '@api/endpoints/webhooks/chromatic/webhooks.chromatic.service';
import { GitHubWebhookController } from '@api/endpoints/webhooks/github/webhooks.github.controller';
import { GitHubWebhookService } from '@api/endpoints/webhooks/github/webhooks.github.service';
import { HeygenWebhookController } from '@api/endpoints/webhooks/heygen/webhooks.heygen.controller';
import { HeygenWebhookService } from '@api/endpoints/webhooks/heygen/webhooks.heygen.service';
import { KlingWebhookController } from '@api/endpoints/webhooks/klingai/webhooks.kling.controller';
import { KlingWebhookService } from '@api/endpoints/webhooks/klingai/webhooks.kling.service';
import { LeonardoaiWebhookController } from '@api/endpoints/webhooks/leonardoai/webhooks.leonardoai.controller';
import { LeonardoaiWebhookService } from '@api/endpoints/webhooks/leonardoai/webhooks.leonardoai.service';
import { OpusProWebhookController } from '@api/endpoints/webhooks/opuspro/webhooks.opuspro.controller';
import { OpusProWebhookService } from '@api/endpoints/webhooks/opuspro/webhooks.opuspro.service';
import { ReplicateWebhookController } from '@api/endpoints/webhooks/replicate/webhooks.replicate.controller';
import { ReplicateWebhookService } from '@api/endpoints/webhooks/replicate/webhooks.replicate.service';
import { ActivityUpdateService } from '@api/endpoints/webhooks/services/activity-update.service';
import { AutoMergeService } from '@api/endpoints/webhooks/services/auto-merge.service';
import { MediaUploadService } from '@api/endpoints/webhooks/services/media-upload.service';
import { MetadataLookupService } from '@api/endpoints/webhooks/services/metadata-lookup.service';
import { PostProcessingOrchestratorService } from '@api/endpoints/webhooks/services/post-processing-orchestrator.service';
import { StripeWebhookController } from '@api/endpoints/webhooks/stripe/webhooks.stripe.controller';
import { StripeWebhookService } from '@api/endpoints/webhooks/stripe/webhooks.stripe.service';
import { VercelWebhookController } from '@api/endpoints/webhooks/vercel/webhooks.vercel.controller';
import { VercelWebhookService } from '@api/endpoints/webhooks/vercel/webhooks.vercel.service';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { TransactionModule } from '@api/helpers/utils/transaction/transaction.module';
import { BotGatewayModule } from '@api/services/bot-gateway/bot-gateway.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { FileQueueModule } from '@api/services/files-microservice/queue/file-queue.module';
import { StripeModule } from '@api/services/integrations/stripe/stripe.module';
import { MicroservicesModule } from '@api/services/microservices/microservices.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [
    ChromaticWebhookController,
    GitHubWebhookController,
    HeygenWebhookController,
    KlingWebhookController,
    LeonardoaiWebhookController,
    OpusProWebhookController,
    ReplicateWebhookController,
    StripeWebhookController,
    VercelWebhookController,
  ],
  exports: [WebhooksService],
  imports: [
    forwardRef(() => ActivitiesModule),
    forwardRef(() => ApiKeysModule),
    forwardRef(() => AssetsModule),
    forwardRef(() => BotGatewayModule),
    forwardRef(() => BrandsModule),
    forwardRef(() => ClipProjectsModule),
    forwardRef(() => ClipResultsModule),
    forwardRef(() => CommonModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => EvaluationsModule),
    forwardRef(() => FileQueueModule),
    forwardRef(() => FilesClientModule),
    forwardRef(() => IngredientsModule),
    forwardRef(() => MembersModule),
    forwardRef(() => MetadataModule),
    forwardRef(() => MicroservicesModule),
    forwardRef(() => ModelsModule),
    forwardRef(() => NotificationsModule),
    forwardRef(() => NotificationsPublisherModule),
    forwardRef(() => OrganizationSettingsModule),
    forwardRef(() => OrganizationsModule),
    forwardRef(() => RolesModule),
    forwardRef(() => SettingsModule),
    forwardRef(() => StripeModule),
    forwardRef(() => SubscriptionAttributionsModule),
    forwardRef(() => SubscriptionsModule),
    forwardRef(() => TrainingsModule),
    forwardRef(() => TransactionModule),
    forwardRef(() => UserSubscriptionsModule),
    forwardRef(() => UserSetupModule),
    forwardRef(() => UsersModule),
  ],
  providers: [
    ActivityUpdateService,
    AutoMergeService,
    ChromaticWebhookService,
    ModelRegistrationService,
    GitHubWebhookService,
    HeygenWebhookService,
    KlingWebhookService,
    LeonardoaiWebhookService,
    MediaUploadService,
    MetadataLookupService,
    OpusProWebhookService,
    PostProcessingOrchestratorService,
    ReplicateWebhookService,
    StripeWebhookService,
    VercelWebhookService,
    WebhooksService,
  ],
})
export class WebhooksModule {}
