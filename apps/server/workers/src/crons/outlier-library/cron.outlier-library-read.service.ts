import { OutlierWeeklyReadService } from '@api/collections/outlier-library/services/outlier-weekly-read.service';
import { Injectable } from '@nestjs/common';

/** The daily slice of the weekly read of tracked creators (#11642). */
@Injectable()
export class CronOutlierLibraryReadService {
  constructor(private readonly weeklyRead: OutlierWeeklyReadService) {}

  readTrackedCreators() {
    return this.weeklyRead.run();
  }
}
