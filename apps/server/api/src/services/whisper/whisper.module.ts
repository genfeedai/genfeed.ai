import { ConfigModule } from '@api/config/config.module';
import { FileQueueModule } from '@api/services/files-microservice/queue/file-queue.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { WhisperService } from '@api/services/whisper/whisper.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [WhisperService],
  imports: [
    ConfigModule,
    forwardRef(() => FileQueueModule),
    HttpModule,
    LoggerModule,
    ReplicateModule,
  ],
  providers: [WhisperService],
})
export class WhisperModule {}
