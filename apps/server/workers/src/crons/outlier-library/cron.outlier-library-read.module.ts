import { OutlierLibraryModule } from '@api/collections/outlier-library/outlier-library.module';
import { Module } from '@nestjs/common';
import { CronOutlierLibraryReadService } from '@workers/crons/outlier-library/cron.outlier-library-read.service';

@Module({
  exports: [CronOutlierLibraryReadService],
  imports: [OutlierLibraryModule],
  providers: [CronOutlierLibraryReadService],
})
export class CronOutlierLibraryReadModule {}
