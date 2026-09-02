/**
 * Metadata Module
 * Content metadata: custom fields, metadata schemas, bulk metadata updates,
and metadata search capabilities.
 */
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [],
  exports: [MetadataService],
  imports: [],
  providers: [MetadataService],
})
export class MetadataModule {}
