import { ImportedSourceMediaController } from '@api/collections/imported-sources/controllers/imported-source-media.controller';
import { ImportedSourcesController } from '@api/collections/imported-sources/controllers/imported-sources.controller';
import { ImportedSourceMediaService } from '@api/collections/imported-sources/services/imported-source-media.service';
import { ImportedSourcesService } from '@api/collections/imported-sources/services/imported-sources.service';
import { AgentSourceIngestModule } from '@api/services/agent-source-ingest/agent-source-ingest.module';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';
@Module({
  imports: [PrismaModule, AgentSourceIngestModule],
  controllers: [ImportedSourcesController, ImportedSourceMediaController],
  providers: [ImportedSourcesService, ImportedSourceMediaService],
  exports: [ImportedSourcesService],
})
export class ImportedSourcesModule {}
