import { ApiKeysModule } from '@api/collections/api-keys/api-keys.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { ConfigModule } from '@api/config/config.module';
import { ManagedInferenceController } from '@api/endpoints/v1/managed-inference/managed-inference.controller';
import { ManagedInferenceService } from '@api/endpoints/v1/managed-inference/managed-inference.service';
import { ManagedInferenceClientService } from '@api/endpoints/v1/managed-inference/managed-inference-client.service';
import { FalModule } from '@api/services/integrations/fal/fal.module';
import { LeonardoAIModule } from '@api/services/integrations/leonardoai/leonardoai.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [ManagedInferenceController],
  exports: [ManagedInferenceClientService],
  imports: [
    ApiKeysModule,
    ConfigModule,
    forwardRef(() => CreditsModule),
    FalModule,
    HttpModule,
    LeonardoAIModule,
    LoggerModule,
    ReplicateModule,
  ],
  providers: [ManagedInferenceClientService, ManagedInferenceService],
})
export class ManagedInferenceModule {}
