import { BrandsModule } from '@api/collections/brands/brands.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { PersonasModule } from '@api/collections/personas/personas.module';
import { ConfigModule } from '@api/config/config.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { ContentOrchestrationController } from '@api/services/content-orchestration/content-orchestration.controller';
import { ContentOrchestrationService } from '@api/services/content-orchestration/content-orchestration.service';
import { ContentPipelineProcessor } from '@api/services/content-orchestration/content-pipeline.processor';
import { ContentPipelineQueueService } from '@api/services/content-orchestration/content-pipeline-queue.service';
import { StepExecutorService } from '@api/services/content-orchestration/step-executor.service';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { ElevenLabsModule } from '@api/services/integrations/elevenlabs/elevenlabs.module';
import { FalModule } from '@api/services/integrations/fal/fal.module';
import { FleetModule } from '@api/services/integrations/fleet/fleet.module';
import { HiggsFieldModule } from '@api/services/integrations/higgsfield/higgsfield.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { PersonaContentModule } from '@api/services/persona-content/persona-content.module';
import { SharedModule } from '@api/shared/shared.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [ContentOrchestrationController],
  exports: [ContentOrchestrationService, ContentPipelineQueueService],
  imports: [
    ConfigModule,
    LoggerModule,
    ByokModule,
    forwardRef(() => BrandsModule),
    forwardRef(() => ElevenLabsModule),
    forwardRef(() => FalModule),
    forwardRef(() => FleetModule),
    forwardRef(() => HiggsFieldModule),
    forwardRef(() => ReplicateModule),
    forwardRef(() => PersonaContentModule),
    forwardRef(() => PersonasModule),
    forwardRef(() => IngredientsModule),
    forwardRef(() => MetadataModule),
    forwardRef(() => FilesClientModule),
    forwardRef(() => SharedModule),
    BullModule.registerQueue({
      defaultJobOptions: {
        attempts: 3,
        backoff: { delay: 10000, type: 'exponential' },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
      name: 'content-pipeline',
    }),
  ],
  providers: [
    ContentOrchestrationService,
    ContentPipelineProcessor,
    ContentPipelineQueueService,
    StepExecutorService,
  ],
})
export class ContentOrchestrationModule {}
