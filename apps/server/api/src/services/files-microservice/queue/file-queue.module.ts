import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { DEFAULT_HTTP_TIMEOUT_MS } from '@api/constants/http-timeout.constant';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { MediaUrlsModule } from '@api/services/media-urls/media-urls.module';
import { ConfigModule } from '@libs/config/config.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  exports: [FileQueueService],
  imports: [
    HttpModule.register({ timeout: DEFAULT_HTTP_TIMEOUT_MS }),
    ConfigModule,
    CredentialsCoreModule,
    MediaUrlsModule,
  ],
  providers: [FileQueueService],
})
export class FileQueueModule {}
