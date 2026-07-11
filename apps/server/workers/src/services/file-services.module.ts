import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ApiKeyHelperService } from '@server/services/api-key/api-key-helper.service';
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';

/**
 * Provides the files-microservice client and API-key helper — extracted to
 * `@genfeedai/server` (#1090) — to the workers runtime, so cron tasks and the
 * generation providers no longer deep-import them from API source.
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
