import { ApiKeyHelperService } from '@api/services/api-key/api-key-helper.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

/**
 * Provides the files-microservice client and API-key helper to the workers
 * runtime so cron tasks and generation providers share the API modules.
 */
const FILE_SERVICES = [ApiKeyHelperService, FilesClientService] as const;

@Module({
  exports: [...FILE_SERVICES],
  imports: [
    ConfigModule,
    HttpModule.register({ maxRedirects: 5, timeout: 30000 }),
    LoggerModule,
  ],
  providers: [...FILE_SERVICES],
})
export class FileServicesModule {}
