import { EditorRenderJobsController } from '@files/controllers/editor-render-jobs.controller';
import { FilesController } from '@files/controllers/files.controller';
import { FilesAudioOverlayController } from '@files/controllers/files-audio-overlay.controller';
import { FilesMetadataController } from '@files/controllers/files-metadata.controller';
import { FilesProcessingController } from '@files/controllers/files-processing.controller';
import { FilesStorageController } from '@files/controllers/files-storage.controller';
import { CronModule } from '@files/cron/cron.module';
import { QueuesModule } from '@files/queues/queues.module';
import { ServicesModule } from '@files/services/services.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [
    EditorRenderJobsController,
    FilesController,
    FilesMetadataController,
    FilesAudioOverlayController,
    FilesProcessingController,
    FilesStorageController,
  ],
  imports: [QueuesModule, ServicesModule, CronModule],
})
export class ControllersModule {}
