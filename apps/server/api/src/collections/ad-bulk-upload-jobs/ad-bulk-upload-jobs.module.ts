import { AdBulkUploadJobsService } from '@api/collections/ad-bulk-upload-jobs/services/ad-bulk-upload-jobs.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [AdBulkUploadJobsService],
  imports: [],
  providers: [AdBulkUploadJobsService],
})
export class AdBulkUploadJobsModule {}
