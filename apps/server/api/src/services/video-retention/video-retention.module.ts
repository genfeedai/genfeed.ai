import { OrganizationPaidAccessModule } from '@api/common/subscriptions/organization-paid-access.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { VideoRetentionService } from '@api/services/video-retention/video-retention.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [VideoRetentionService],
  imports: [FilesClientModule, LoggerModule, OrganizationPaidAccessModule],
  providers: [VideoRetentionService],
})
export class VideoRetentionModule {}
