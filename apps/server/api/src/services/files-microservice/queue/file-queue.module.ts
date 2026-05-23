import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { ConfigModule } from '@api/config/config.module';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [FileQueueService],
  imports: [HttpModule, ConfigModule, forwardRef(() => CredentialsCoreModule)],
  providers: [FileQueueService],
})
export class FileQueueModule {}
