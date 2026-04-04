/**
 * Metadata Module
 * Content metadata: custom fields, metadata schemas, bulk metadata updates,
and metadata search capabilities.
 */
import {
  Metadata,
  MetadataSchema,
} from '@api/collections/metadata/schemas/metadata.schema';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [],
  exports: [MongooseModule, MetadataService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          name: Metadata.name,
          useFactory: () => {
            const schema = MetadataSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Extension-based metadata queries
            schema.index(
              { extension: 1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [MetadataService],
})
export class MetadataModule {}
