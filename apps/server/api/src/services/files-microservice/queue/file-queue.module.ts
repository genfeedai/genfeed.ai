import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { MediaUrlsModule } from '@api/services/media-urls/media-urls.module';
import { ConfigModule } from '@libs/config/config.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  exports: [FileQueueService],
  imports: [HttpModule, ConfigModule, CredentialsCoreModule, MediaUrlsModule],
  providers: [FileQueueService],
})
export class FileQueueModule {}
