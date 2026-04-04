/**
 * Runs Module
 * Unified execution tracking for human and agent initiated actions
 * across web, Telegram, CLI, extension, IDE, and API surfaces.
 */
import { RunsController } from '@api/collections/runs/controllers/runs.controller';
import { Run, RunSchema } from '@api/collections/runs/schemas/run.schema';
import { RunsService } from '@api/collections/runs/services/runs.service';
import { RunsMeteringService } from '@api/collections/runs/services/runs-metering.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [RunsController],
  exports: [MongooseModule, RunsService],
  imports: [
    NotificationsPublisherModule,
    MongooseModule.forFeatureAsync(
      [
        {
          name: Run.name,
          useFactory: () => {
            const schema = RunSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1, user: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1, status: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            schema.index(
              { idempotencyKey: 1, organization: 1 },
              {
                partialFilterExpression: {
                  idempotencyKey: { $exists: true, $type: 'string' },
                  isDeleted: false,
                },
                unique: true,
              },
            );

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1, traceId: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [RunsService, RunsMeteringService],
})
export class RunsModule {}
