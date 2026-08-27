import { PublicClipToolStoreService } from '@server/services/public-clip-tool/public-clip-tool-store.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [PublicClipToolStoreService],
  providers: [PublicClipToolStoreService],
})
export class PublicClipToolStoreModule {}
