import {
  Persona,
  PersonaSchema,
} from '@api/collections/personas/schemas/persona.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { ContentOrchestrationModule } from '@api/services/content-orchestration/content-orchestration.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CronContentPipelineService } from '@workers/crons/content-pipeline/cron.content-pipeline.service';

@Module({
  exports: [CronContentPipelineService],
  imports: [
    forwardRef(() => ContentOrchestrationModule),
    MongooseModule.forFeature(
      [{ name: Persona.name, schema: PersonaSchema }],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [CronContentPipelineService],
})
export class CronContentPipelineModule {}
