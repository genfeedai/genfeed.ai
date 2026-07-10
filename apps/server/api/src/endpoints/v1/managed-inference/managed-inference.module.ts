import { ApiKeysModule } from '@api/collections/api-keys/api-keys.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { ManagedInferenceController } from '@api/endpoints/v1/managed-inference/managed-inference.controller';
import { ManagedInferenceService } from '@api/endpoints/v1/managed-inference/managed-inference.service';
import { ManagedInferenceClientService } from '@api/endpoints/v1/managed-inference/managed-inference-client.service';
import { FalModule } from '@api/services/integrations/fal/fal.module';
import { FleetModule } from '@api/services/integrations/fleet/fleet.module';
import { LeonardoAIModule } from '@api/services/integrations/leonardoai/leonardoai.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { PollUntilModule } from '@api/shared/services/poll-until/poll-until.module';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [ManagedInferenceController],
  exports: [ManagedInferenceClientService],
  imports: [
    forwardRef(() => ApiKeysModule),
    forwardRef(() => ConfigModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => FalModule),
    forwardRef(() => FleetModule),
    forwardRef(() => HttpModule),
    forwardRef(() => LeonardoAIModule),
    forwardRef(() => LoggerModule),
    forwardRef(() => PollUntilModule),
    forwardRef(() => ReplicateModule),
  ],
  providers: [ManagedInferenceClientService, ManagedInferenceService],
})
export class ManagedInferenceModule {}
