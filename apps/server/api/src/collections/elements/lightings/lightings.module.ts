import { ElementsLightingsController } from '@api/collections/elements/lightings/controllers/lightings.controller';
import {
  ElementLighting,
  ElementLightingSchema,
} from '@api/collections/elements/lightings/schemas/lighting.schema';
import { ElementsLightingsService } from '@api/collections/elements/lightings/services/lightings.service';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [ElementsLightingsController],
  exports: [ElementsLightingsService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: ElementLighting.name,
          useFactory: () => {
            const schema = ElementLightingSchema;

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
  providers: [ElementsLightingsService],
})
export class ElementsLightingsModule {}
