import { BrandsModule } from '@api/collections/brands/brands.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { PersonasModule } from '@api/collections/personas/personas.module';
import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { ElevenLabsModule } from '@api/services/integrations/elevenlabs/elevenlabs.module';
import { FalModule } from '@api/services/integrations/fal/fal.module';
import { HiggsFieldModule } from '@api/services/integrations/higgsfield/higgsfield.module';
import { ManagedInferenceRuntimeModule } from '@api/services/integrations/managed-inference-runtime/managed-inference-runtime.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { PersonaContentModule } from '@api/services/persona-content/persona-content.module';
import { SharedModule } from '@api/shared/shared.module';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';
import { ContentOrchestrationService } from '@server/services/content-orchestration/content-orchestration.service';
import { StepExecutorService } from '@server/services/content-orchestration/step-executor.service';

@Module({
  exports: [ContentOrchestrationService],
  imports: [
    ConfigModule,
    LoggerModule,
    ByokModule,
    BrandsModule,
    ElevenLabsModule,
    FalModule,
    ManagedInferenceRuntimeModule,
    HiggsFieldModule,
    ReplicateModule,
    PersonaContentModule,
    PersonasModule,
    IngredientsModule,
    MetadataModule,
    FilesClientModule,
    SharedModule,
    WorkflowsCoreModule,
  ],
  providers: [ContentOrchestrationService, StepExecutorService],
})
export class ContentOrchestrationModule {}
