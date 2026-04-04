import {
  ContentPlan,
  ContentPlanSchema,
} from '@api/collections/content-plans/schemas/content-plan.schema';
import { ContentPlansService } from '@api/collections/content-plans/services/content-plans.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  exports: [ContentPlansService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          name: ContentPlan.name,
          useFactory: () => {
            const schema = ContentPlanSchema;
            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { brand: 1, createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            schema.index(
              { isDeleted: 1, organization: 1, status: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [ContentPlansService],
})
export class ContentPlansModule {}
