import { TranscriptsController } from '@api/collections/transcripts/controllers/transcripts.controller';
import { TranscriptsService } from '@api/collections/transcripts/services/transcripts.service';
import { FileQueueModule } from '@api/services/files-microservice/queue/file-queue.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [TranscriptsController],
  exports: [TranscriptsService],
  imports: [FileQueueModule],
  providers: [TranscriptsService],
})
export class TranscriptsModule {}
