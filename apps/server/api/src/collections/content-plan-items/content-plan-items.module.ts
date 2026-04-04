import {
  ContentPlanItem,
  ContentPlanItemSchema,
} from '@api/collections/content-plan-items/schemas/content-plan-item.schema';
import { ContentPlanItemsService } from '@api/collections/content-plan-items/services/content-plan-items.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  exports: [ContentPlanItemsService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          name: ContentPlanItem.name,
          useFactory: () => {
            const schema = ContentPlanItemSchema;
            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              {
                isDeleted: 1,
                organization: 1,
                plan: 1,
                scheduledAt: 1,
              },
              { partialFilterExpression: { isDeleted: false } },
            );

            schema.index(
              { isDeleted: 1, organization: 1, plan: 1, status: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [ContentPlanItemsService],
})
export class ContentPlanItemsModule {}
