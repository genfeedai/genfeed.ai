import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { ConfigModule } from '@libs/config/config.module';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [FileQueueService],
  imports: [HttpModule, ConfigModule, forwardRef(() => CredentialsCoreModule)],
  providers: [FileQueueService],
})
export class FileQueueModule {}
