import { BrandsModule } from '@api/collections/brands/brands.module';
import { ContentIntelligenceModule } from '@api/collections/content-intelligence/content-intelligence.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { PersonasModule } from '@api/collections/personas/personas.module';
import { TrainingsModule } from '@api/collections/trainings/trainings.module';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { AdminFleetController } from '@api/endpoints/admin/fleet/fleet.controller';
import { AdminFleetService } from '@api/endpoints/admin/fleet/fleet.service';
import { AdminFleetAssetService } from '@api/endpoints/admin/fleet/services/fleet-asset.service';
import { AdminFleetCharacterService } from '@api/endpoints/admin/fleet/services/fleet-character.service';
import { AdminFleetGenerationService } from '@api/endpoints/admin/fleet/services/fleet-generation.service';
import { AdminFleetInfraService } from '@api/endpoints/admin/fleet/services/fleet-infra.service';
import { AdminFleetIngestService } from '@api/endpoints/admin/fleet/services/fleet-ingest.service';
import { AdminFleetMediaService } from '@api/endpoints/admin/fleet/services/fleet-media.service';
import { AdminFleetPublishingService } from '@api/endpoints/admin/fleet/services/fleet-publishing.service';
import { AdminFleetStatsService } from '@api/endpoints/admin/fleet/services/fleet-stats.service';
import { AdminFleetTrainingService } from '@api/endpoints/admin/fleet/services/fleet-training.service';
import { AdminFleetTrainingOrchestratorService } from '@api/endpoints/admin/fleet/services/fleet-training-orchestrator.service';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { ComfyUIModule } from '@api/services/integrations/comfyui/comfyui.module';
import { ElevenLabsModule } from '@api/services/integrations/elevenlabs/elevenlabs.module';
import { FacebookModule } from '@api/services/integrations/facebook/facebook.module';
import { FleetModule } from '@api/services/integrations/fleet/fleet.module';
import { HeyGenModule } from '@api/services/integrations/heygen/heygen.module';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [AdminFleetController],
  exports: [AdminFleetService],
  imports: [
    forwardRef(() => BrandsModule),
    forwardRef(() => ContentIntelligenceModule),
    forwardRef(() => PersonasModule),
    forwardRef(() => IngredientsModule),
    forwardRef(() => ModelsModule),
    forwardRef(() => OrganizationSettingsModule),
    forwardRef(() => TrainingsModule),
    forwardRef(() => CredentialsCoreModule),
    forwardRef(() => FleetModule),
    forwardRef(() => FilesClientModule),
    forwardRef(() => ComfyUIModule),
    forwardRef(() => ElevenLabsModule),
    forwardRef(() => HeyGenModule),
    forwardRef(() => InstagramModule),
    forwardRef(() => TwitterModule),
    forwardRef(() => FacebookModule),
  ],
  providers: [
    AdminFleetService,
    AdminFleetAssetService,
    AdminFleetCharacterService,
    AdminFleetGenerationService,
    AdminFleetInfraService,
    AdminFleetIngestService,
    AdminFleetMediaService,
    AdminFleetPublishingService,
    AdminFleetStatsService,
    AdminFleetTrainingOrchestratorService,
    AdminFleetTrainingService,
    IpWhitelistGuard,
    ModelRegistrationService,
    SuperAdminGuard,
  ],
})
export class AdminFleetModule {}
