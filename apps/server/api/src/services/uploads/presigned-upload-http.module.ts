import { PresignedUploadController } from '@api/services/uploads/presigned-upload.controller';
import { UploadsModule } from '@api/services/uploads/uploads.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [PresignedUploadController],
  imports: [UploadsModule],
})
export class PresignedUploadHttpModule {}
