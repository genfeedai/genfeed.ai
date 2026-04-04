import { GoalsController } from '@api/collections/goals/controllers/goals.controller';
import { Goal, GoalSchema } from '@api/collections/goals/schemas/goal.schema';
import { GoalsService } from '@api/collections/goals/services/goals.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [GoalsController],
  exports: [GoalsService, MongooseModule],
  imports: [
    LoggerModule,
    MongooseModule.forFeatureAsync(
      [
        {
          name: Goal.name,
          useFactory: () => {
            const schema = GoalSchema;
            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { isDeleted: 1, organization: 1, updatedAt: -1 },
              { partialFilterExpression: { isDeleted: false } },
            );
            schema.index({ isDeleted: 1, level: 1, organization: 1 });
            schema.index({ isDeleted: 1, parentId: 1 });

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [GoalsService],
})
export class GoalsModule {}
