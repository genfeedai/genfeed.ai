/**
 * Moods Module
 * Content mood settings: emotional tone configurations, mood-based generation,
and mood library management.
 */
import { ElementsMoodsController } from '@api/collections/elements/moods/controllers/moods.controller';
import {
  ElementMood,
  ElementMoodSchema,
} from '@api/collections/elements/moods/schemas/mood.schema';
import { ElementsMoodsService } from '@api/collections/elements/moods/services/moods.service';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [ElementsMoodsController],
  exports: [ElementsMoodsService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: ElementMood.name,
          useFactory: () => {
            const schema = ElementMoodSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [ElementsMoodsService],
})
export class ElementsMoodsModule {}
