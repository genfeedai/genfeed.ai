import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { FileQueueModule } from '@api/services/files-microservice/queue/file-queue.module';
import { forwardRef, Module } from '@nestjs/common';

/**
 * FilesMicroserviceModule
 *
 * Combined module that provides both file client and queue services.
 * This acts as a barrel module for the files-microservice functionality.
 */
@Module({
  exports: [FilesClientModule, FileQueueModule],
  imports: [
    forwardRef(() => FilesClientModule),
    forwardRef(() => FileQueueModule),
  ],
})
export class FilesMicroserviceModule {}
