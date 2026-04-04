import { BrandsModule } from '@api/collections/brands/brands.module';
import { ContentIntelligenceModule } from '@api/collections/content-intelligence/content-intelligence.module';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { PersonasModule } from '@api/collections/personas/personas.module';
import { TrainingsModule } from '@api/collections/trainings/trainings.module';
import { DarkroomController } from '@api/endpoints/admin/darkroom/darkroom.controller';
import { DarkroomService } from '@api/endpoints/admin/darkroom/darkroom.service';
import { DarkroomTrainingService } from '@api/endpoints/admin/darkroom/services/darkroom-training.service';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { ComfyUIModule } from '@api/services/integrations/comfyui/comfyui.module';
import { ElevenLabsModule } from '@api/services/integrations/elevenlabs/elevenlabs.module';
import { FacebookModule } from '@api/services/integrations/facebook/facebook.module';
import { FleetModule } from '@api/services/integrations/fleet/fleet.module';
import { HeyGenModule } from '@api/services/integrations/heygen/heygen.module';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [DarkroomController],
  exports: [DarkroomService],
  imports: [
    BrandsModule,
    ContentIntelligenceModule,
    PersonasModule,
    IngredientsModule,
    TrainingsModule,
    CredentialsModule,
    FleetModule,
    FilesClientModule,
    ComfyUIModule,
    ElevenLabsModule,
    HeyGenModule,
    InstagramModule,
    TwitterModule,
    FacebookModule,
  ],
  providers: [DarkroomService, DarkroomTrainingService, IpWhitelistGuard],
})
export class DarkroomModule {}
