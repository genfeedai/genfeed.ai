import { TranscriptsController } from '@api/collections/transcripts/controllers/transcripts.controller';
import {
  Transcript,
  TranscriptSchema,
} from '@api/collections/transcripts/schemas/transcript.schema';
import { TranscriptsService } from '@api/collections/transcripts/services/transcripts.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { FileQueueModule } from '@api/services/files-microservice/queue/file-queue.module';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [TranscriptsController],
  exports: [TranscriptsService],
  imports: [
    FileQueueModule,
    MongooseModule.forFeatureAsync(
      [
        {
          name: Transcript.name,
          useFactory: () => {
            const schema = TranscriptSchema;

            // Organization queries with soft delete
            schema.index(
              { isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // User queries with soft delete
            schema.index(
              { isDeleted: 1, user: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // YouTube ID lookup
            schema.index({ youtubeId: 1 });

            // Status queries
            schema.index({ status: 1 });

            // Sorting by creation date
            schema.index({ createdAt: -1 });

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [TranscriptsService],
})
export class TranscriptsModule {}
