/**
 * Voices Module
 * AI voice generation: text-to-speech, voice cloning, voice profile management,
 * audio file storage, and voice characteristic customization.
 */
import { CreditsModule } from '@api/collections/credits/credits.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { VoicesController } from '@api/collections/voices/controllers/voices.controller';
import { VoicesCatalogController } from '@api/collections/voices/controllers/voices-catalog.controller';
import { VoicesOperationsController } from '@api/collections/voices/controllers/voices-operations.controller';
import { VoiceCloneService } from '@api/collections/voices/services/voice-clone.service';
import { VoiceLibraryService } from '@api/collections/voices/services/voice-library.service';
import { VotesModule } from '@api/collections/votes/votes.module';
import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { QueuesModule } from '@api/queues/core/queues.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { ElevenLabsModule } from '@api/services/integrations/elevenlabs/elevenlabs.module';
import { HeyGenModule } from '@api/services/integrations/heygen/heygen.module';
import { ManagedInferenceRuntimeModule } from '@api/services/integrations/managed-inference-runtime/managed-inference-runtime.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { FailedGenerationModule } from '@api/shared/services/failed-generation/failed-generation.module';
import { Module } from '@nestjs/common';
import { ExternalVoiceCatalogService } from '@server/collections/voices/services/external-voice-catalog.service';
import { VoiceCreditsService } from '@server/collections/voices/services/voice-credits.service';
import { VoiceGenerationService } from '@server/collections/voices/services/voice-generation.service';
import { VoicesService } from '@server/collections/voices/services/voices.service';

@Module({
  controllers: [
    VoicesController,
    VoicesCatalogController,
    VoicesOperationsController,
  ],
  exports: [ExternalVoiceCatalogService, VoiceGenerationService, VoicesService],
  imports: [
    IngredientsModule,
    MetadataModule,
    CreditsModule,
    ModelsModule,

    ByokModule,
    ElevenLabsModule,
    FailedGenerationModule,
    FilesClientModule,
    ManagedInferenceRuntimeModule,
    HeyGenModule,
    NotificationsPublisherModule,
    QueuesModule,
    VotesModule,
    WorkflowsCoreModule,
  ],
  providers: [
    ExternalVoiceCatalogService,
    VoiceCloneService,
    VoiceCreditsService,
    VoiceGenerationService,
    VoiceLibraryService,
    VoicesService,
    CreditsGuard,
    CreditsInterceptor,
  ],
})
export class VoicesModule {}
