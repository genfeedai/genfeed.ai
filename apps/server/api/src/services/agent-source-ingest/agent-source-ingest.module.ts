import { AgentSourceDownloadService } from '@api/services/agent-source-ingest/agent-source-download.service';
import { AgentSourceIngestService } from '@api/services/agent-source-ingest/agent-source-ingest.service';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { ConfigModule } from '@libs/config/config.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  imports: [FilesClientModule, PrismaModule, ConfigModule, HttpModule],
  providers: [AgentSourceDownloadService, AgentSourceIngestService],
  exports: [AgentSourceIngestService],
})
export class AgentSourceIngestModule {}
