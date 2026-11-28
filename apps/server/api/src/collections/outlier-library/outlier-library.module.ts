import { OutlierCreatorReaderService } from '@api/collections/outlier-library/readers/outlier-creator-reader.service';
import { OutlierCreatorSeedService } from '@api/collections/outlier-library/services/outlier-creator-seed.service';
import { OutlierLibraryService } from '@api/collections/outlier-library/services/outlier-library.service';
import { OutlierReadClaimService } from '@api/collections/outlier-library/services/outlier-read-claim.service';
import { OutlierWeeklyReadService } from '@api/collections/outlier-library/services/outlier-weekly-read.service';
import { PlatformSettingsModule } from '@api/collections/platform-settings/platform-settings.module';
import { SourceCollectorModule } from '@api/services/source-collector/source-collector.module';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [
    OutlierCreatorSeedService,
    OutlierLibraryService,
    OutlierWeeklyReadService,
  ],
  imports: [
    LoggerModule,
    PlatformSettingsModule,
    PrismaModule,
    SourceCollectorModule,
  ],
  providers: [
    OutlierCreatorReaderService,
    OutlierCreatorSeedService,
    OutlierLibraryService,
    OutlierReadClaimService,
    OutlierWeeklyReadService,
  ],
})
export class OutlierLibraryModule {}
