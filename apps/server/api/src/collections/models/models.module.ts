/**
 * Models Module
 * AI model configurations: model selections, parameters, version management,
and model performance tracking.
 */
import { ModelsController } from '@api/collections/models/controllers/models.controller';
import {
  Model,
  ModelSchema,
} from '@api/collections/models/schemas/model.schema';
import { ModelsService } from '@api/collections/models/services/models.service';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [ModelsController],
  exports: [MongooseModule, ModelsService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: Model.name,
          useFactory: () => {
            const schema = ModelSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            schema.index({
              category: 1,
              label: 1,
              provider: 1,
            });

            schema.index(
              {
                category: 1,
                key: 1,
                label: 1,
                provider: 1,
              },
              { unique: true },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [ModelsService],
})
export class ModelsModule {}
