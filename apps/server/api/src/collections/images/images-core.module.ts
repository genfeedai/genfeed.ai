import { ImagesService } from '@api/collections/images/services/images.service';
import { Module } from '@nestjs/common';

/** Image persistence only. Generation/HTTP stays on ImagesModule. */
@Module({
  exports: [ImagesService],
  providers: [ImagesService],
})
export class ImagesCoreModule {}
