import { ConfigModule } from '@files/config/config.module';
import { EditorRenderJobsController } from '@files/controllers/editor-render-jobs.controller';
import { FilesController } from '@files/controllers/files.controller';
import { FilesAudioOverlayController } from '@files/controllers/files-audio-overlay.controller';
import { FilesMetadataController } from '@files/controllers/files-metadata.controller';
import { FilesProcessingController } from '@files/controllers/files-processing.controller';
import { FilesStorageController } from '@files/controllers/files-storage.controller';
import { FilesWatermarkExportController } from '@files/controllers/files-watermark-export.controller';
import { CronModule } from '@files/cron/cron.module';
import { QueuesModule } from '@files/queues/queues.module';
import { ServicesModule } from '@files/services/services.module';
import { WatermarkExportModule } from '@files/services/watermark-export/watermark-export.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [
    EditorRenderJobsController,
    FilesController,
    FilesMetadataController,
    FilesAudioOverlayController,
    FilesProcessingController,
    FilesStorageController,
    // Its only route (`files/watermark-export`) is a static segment that
    // cannot be shadowed by any wildcard/param route above (e.g.
    // FilesStorageController's `download/:type/*key`), so it is safe to
    // register last rather than disturbing the audio-overlay/processing order.
    FilesWatermarkExportController,
  ],
  imports: [
    ConfigModule,
    WatermarkExportModule,
    QueuesModule,
    ServicesModule,
    CronModule,
  ],
})
export class ControllersModule {}
