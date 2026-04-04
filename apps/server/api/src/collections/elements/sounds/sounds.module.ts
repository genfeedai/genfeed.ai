/**
 * Sounds Module
 * Sound effect library: audio effects, sound categories, sound mixing,
and audio asset management.
 */
import { ElementsSoundsController } from '@api/collections/elements/sounds/controllers/sounds.controller';
import {
  ElementSound,
  ElementSoundSchema,
} from '@api/collections/elements/sounds/schemas/sound.schema';
import { ElementsSoundsService } from '@api/collections/elements/sounds/services/sounds.service';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [ElementsSoundsController],
  exports: [ElementsSoundsService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: ElementSound.name,
          useFactory: () => {
            const schema = ElementSoundSchema;

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
  providers: [ElementsSoundsService],
})
export class ElementsSoundsModule {}
