/**
 * Voices Module
 * AI voice generation: text-to-speech, voice cloning, voice profile management,
audio file storage, and voice characteristic customization.
 */
import { CreditsModule } from '@api/collections/credits/credits.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { VoicesController } from '@api/collections/voices/controllers/voices.controller';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import { VotesModule } from '@api/collections/votes/votes.module';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { ElevenLabsModule } from '@api/services/integrations/elevenlabs/elevenlabs.module';
import { FleetModule } from '@api/services/integrations/fleet/fleet.module';
import { HeyGenModule } from '@api/services/integrations/heygen/heygen.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { FailedGenerationModule } from '@api/shared/services/failed-generation/failed-generation.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [VoicesController],
  exports: [VoicesService],
  imports: [
    forwardRef(() => IngredientsModule),
    forwardRef(() => MetadataModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => ModelsModule),

    ByokModule,
    ElevenLabsModule,
    FailedGenerationModule,
    FilesClientModule,
    FleetModule,
    HeyGenModule,
    NotificationsPublisherModule,
    VotesModule,
  ],
  providers: [VoicesService, CreditsGuard, CreditsInterceptor],
})
export class VoicesModule {}
