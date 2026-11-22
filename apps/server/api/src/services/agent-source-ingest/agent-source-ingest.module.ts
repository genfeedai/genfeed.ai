import { DEFAULT_HTTP_TIMEOUT_MS } from '@api/constants/http-timeout.constant';
import { AgentImportedSourceIngestService } from '@api/services/agent-source-ingest/agent-imported-source-ingest.service';
import { AgentSourceDownloadService } from '@api/services/agent-source-ingest/agent-source-download.service';
import { AgentSourceIngestService } from '@api/services/agent-source-ingest/agent-source-ingest.service';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { ConfigModule } from '@libs/config/config.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    FilesClientModule,
    PrismaModule,
    ConfigModule,
    HttpModule.register({ timeout: DEFAULT_HTTP_TIMEOUT_MS }),
  ],
  providers: [
    AgentSourceDownloadService,
    AgentSourceIngestService,
    AgentImportedSourceIngestService,
  ],
  exports: [AgentSourceIngestService, AgentImportedSourceIngestService],
})
export class AgentSourceIngestModule {}
