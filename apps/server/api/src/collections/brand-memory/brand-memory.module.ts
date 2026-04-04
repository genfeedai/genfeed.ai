import { BrandMemoryController } from '@api/collections/brand-memory/controllers/brand-memory.controller';
import {
  BrandMemory,
  BrandMemorySchema,
} from '@api/collections/brand-memory/schemas/brand-memory.schema';
import { BrandMemoryService } from '@api/collections/brand-memory/services/brand-memory.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [BrandMemoryController],
  exports: [BrandMemoryService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          name: BrandMemory.name,
          useFactory: () => {
            const schema = BrandMemorySchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { brand: 1, date: 1, isDeleted: 1, organization: 1 },
              {
                name: 'idx_brand_memory_unique_daily',
                unique: true,
              },
            );

            schema.index(
              { brand: 1, date: -1, isDeleted: 1, organization: 1 },
              { name: 'idx_brand_memory_query' },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [BrandMemoryService],
})
export class BrandMemoryModule {}
