import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { ConfigModule } from '@libs/config/config.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  exports: [FileQueueService],
  imports: [HttpModule, ConfigModule, CredentialsCoreModule],
  providers: [FileQueueService],
})
export class FileQueueModule {}
