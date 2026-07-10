import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Module } from '@nestjs/common';
import { AdBulkUploadJobsService } from '@server/collections/ad-bulk-upload-jobs/services/ad-bulk-upload-jobs.service';
import { SERVER_TOKENS } from '@server/server.dependencies';

@Module({
  exports: [AdBulkUploadJobsService],
  imports: [],
  providers: [
    AdBulkUploadJobsService,
    { provide: SERVER_TOKENS.logger, useExisting: LoggerService },
    { provide: SERVER_TOKENS.prisma, useExisting: PrismaService },
  ],
})
export class AdBulkUploadJobsModule {}
