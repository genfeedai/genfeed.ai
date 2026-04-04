import {
  AdBulkUploadJob,
  AdBulkUploadJobSchema,
} from '@api/collections/ad-bulk-upload-jobs/schemas/ad-bulk-upload-job.schema';
import { AdBulkUploadJobsService } from '@api/collections/ad-bulk-upload-jobs/services/ad-bulk-upload-jobs.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  exports: [AdBulkUploadJobsService, MongooseModule],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          name: AdBulkUploadJob.name,
          useFactory: () => {
            const schema = AdBulkUploadJobSchema;

            schema.index(
              { isDeleted: 1, organization: 1, status: 1 },
              {
                name: 'org_status_lookup',
                partialFilterExpression: { isDeleted: false },
              },
            );

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              {
                name: 'org_recent_jobs',
                partialFilterExpression: { isDeleted: false },
              },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [AdBulkUploadJobsService],
})
export class AdBulkUploadJobsModule {}
