import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { PresignedUploadService } from '@api/services/uploads/presigned-upload.service';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [PresignedUploadService],
  imports: [
    forwardRef(() => IngredientsModule),
    forwardRef(() => MetadataModule),

    FilesClientModule,
  ],
  providers: [PresignedUploadService],
})
export class UploadsModule {}
