import { AdCreativeMappingsService } from '@api/collections/ad-creative-mappings/services/ad-creative-mappings.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [AdCreativeMappingsService],
  imports: [],
  providers: [AdCreativeMappingsService],
})
export class AdCreativeMappingsModule {}
