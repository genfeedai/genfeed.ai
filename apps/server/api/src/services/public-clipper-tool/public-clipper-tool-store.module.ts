import { PublicClipperToolStoreService } from '@api/services/public-clipper-tool/public-clipper-tool-store.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [PublicClipperToolStoreService],
  providers: [PublicClipperToolStoreService],
})
export class PublicClipperToolStoreModule {}
